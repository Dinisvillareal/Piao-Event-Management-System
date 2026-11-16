<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Event;
use App\Models\EventAttendance;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Support;
use Tests\TestCase;

/**
 * A scan taken with no signal is queued on the phone and sent later. The time it was TAKEN (not the
 * time the phone got signal back) must decide whether the window was open and must be the time recorded.
 */
class OfflineScanSyncTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        // The event: call time 7:00, starts 9:00, ends 11:00, sign-out open until 12:00 (all on 14 Nov 2026).
        Carbon::setTestNow(Carbon::parse('2026-11-14 06:00:00', 'Asia/Manila'));
        $this->event = Event::create([
            'name' => 'Assembly', 'description' => 'Test', 'location' => 'Hall',
            'call_time_start' => '2026-11-14 07:00:00', 'event_start' => '2026-11-14 09:00:00',
            'event_end' => '2026-11-14 11:00:00', 'call_time_end' => '2026-11-14 12:00:00',
        ]);
        $this->staff = $this->staff();
        $this->resident = $this->makeUser('Resident');
    }

    private Event $event;
    private $staff;
    private $resident;

    /** "Now" as the server sees it when the queued scan finally arrives. */
    private function syncAt(string $time): void
    {
        Carbon::setTestNow(Carbon::parse("2026-11-14 {$time}", 'Asia/Manila'));
    }

    private function scanIn(?string $scannedAt = null, $user = null)
    {
        $data = ['event_id' => $this->event->id, 'user_id' => $this->resident->id];
        if ($scannedAt !== null) {
            $data['scanned_at'] = $scannedAt;
        }

        return $this->actingAs($user ?? $this->staff)->postJson('/attendance/time-in', $data);
    }

    private function scanOut(?string $scannedAt = null)
    {
        $data = ['event_id' => $this->event->id, 'user_id' => $this->resident->id];
        if ($scannedAt !== null) {
            $data['scanned_at'] = $scannedAt;
        }

        return $this->actingAs($this->staff)->putJson('/attendance/time-out', $data);
    }

    private function row(): ?EventAttendance
    {
        return EventAttendance::where('event_id', $this->event->id)->where('user_id', $this->resident->id)->first();
    }

    /** What is stored in a time column, as 'Y-m-d H:i:s'. */
    private function stored(string $column): ?string
    {
        $v = $this->row()?->{$column};

        return $v === null ? null : substr((string) (is_object($v) ? $v->format('Y-m-d H:i:s') : $v), 0, 19);
    }

    // ---------------------------------------------------------------- the window follows the scan time

    public function test_a_scan_taken_inside_the_window_is_accepted_even_when_it_arrives_after_the_window_closed(): void
    {
        $this->syncAt('09:30');

        $this->scanIn('2026-11-14T08:55:00+08:00')->assertSuccessful()->assertJsonPath('message', 'Time-in successful!');
    }

    public function test_the_time_recorded_is_the_time_of_the_scan_not_the_time_of_the_sync(): void
    {
        $this->syncAt('09:30');

        $this->scanIn('2026-11-14T08:55:00+08:00')->assertSuccessful();

        $this->assertSame('2026-11-14 08:55:00', $this->stored('time_in'));
        $this->assertSame('Incomplete', $this->row()->status);
    }

    public function test_the_same_late_arrival_without_a_scan_time_is_still_refused(): void
    {
        $this->syncAt('09:30');

        $this->scanIn()->assertStatus(403)->assertJsonPath('message', 'Sign-in window has closed. It closed at 9:00 AM.');
        $this->assertNull($this->stored('time_in'));
    }

    public function test_a_scan_taken_after_the_window_closed_is_refused_even_if_it_arrives_much_later(): void
    {
        $this->syncAt('09:30');

        $this->scanIn('2026-11-14T09:10:00+08:00')->assertStatus(403)->assertJsonPath('message', 'Sign-in window has closed. It closed at 9:00 AM.');
        $this->assertNull($this->stored('time_in'));
    }

    public function test_a_scan_taken_before_the_window_opened_is_refused(): void
    {
        $this->syncAt('08:00');

        $this->scanIn('2026-11-14T06:30:00+08:00')->assertStatus(403)->assertJsonPath('message', 'Sign-in is not open yet. It opens at 7:00 AM.');
    }

    public function test_a_time_out_taken_inside_the_sign_out_window_is_accepted_when_synced_after_it_closed(): void
    {
        $this->syncAt('11:30');
        $this->scanIn('2026-11-14T08:50:00+08:00')->assertSuccessful();
        $this->syncAt('12:40');

        $this->scanOut('2026-11-14T11:45:00+08:00')->assertSuccessful()->assertJsonPath('message', 'Time-out successful!');

        $this->assertSame('2026-11-14 11:45:00', $this->stored('time_out'));
        $this->assertSame('Complete', $this->row()->status);
    }

    public function test_a_time_out_taken_after_the_sign_out_window_is_refused(): void
    {
        $this->syncAt('12:40');

        $this->scanOut('2026-11-14T12:20:00+08:00')->assertStatus(403)->assertJsonPath('message', 'Sign-out window has closed. It closed at 12:00 PM.');
    }

    public function test_a_scan_time_in_another_timezone_is_read_correctly(): void
    {
        $this->syncAt('09:30');

        // 00:55 UTC is 08:55 in Manila.
        $this->scanIn('2026-11-14T00:55:00Z')->assertSuccessful();

        $this->assertSame('2026-11-14 08:55:00', $this->stored('time_in'));
    }

    // ---------------------------------------------------------------- the scan time is only believed within limits

    public function test_a_scan_time_in_the_future_is_refused(): void
    {
        $this->syncAt('08:00');

        $this->scanIn('2026-11-14T08:30:00+08:00')->assertStatus(422)
            ->assertJsonPath('message', 'The scan time is in the future. Check the clock of the device that scanned.');
        $this->assertNull($this->stored('time_in'));
    }

    public function test_a_few_minutes_of_clock_difference_are_tolerated_and_never_recorded_in_the_future(): void
    {
        $this->syncAt('08:00');

        $this->scanIn('2026-11-14T08:03:00+08:00')->assertSuccessful();

        $this->assertSame('2026-11-14 08:00:00', $this->stored('time_in'));
    }

    public function test_a_scan_older_than_72_hours_is_refused(): void
    {
        $this->syncAt('08:00');

        $this->scanIn('2026-11-11T07:30:00+08:00')->assertStatus(422)
            ->assertJsonPath('message', 'This scan is too old to sync (more than 72 hours). Record the attendance again.');
    }

    public function test_a_scan_just_inside_72_hours_is_still_checked_normally(): void
    {
        $this->syncAt('08:00');

        // 71 hours old: believed, but the window was not open then (the event is on the 14th).
        $this->scanIn('2026-11-11T09:00:00+08:00')->assertStatus(403);
    }

    public function test_a_nonsense_scan_time_is_refused(): void
    {
        $this->syncAt('08:00');

        $this->scanIn('not a time')->assertStatus(422)->assertJsonValidationErrors('scanned_at');
        $this->scanOut('not a time')->assertStatus(422)->assertJsonValidationErrors('scanned_at');
    }

    // ---------------------------------------------------------------- replays and bookkeeping

    public function test_a_replay_of_a_scan_that_already_landed_says_so_with_a_code_the_phone_can_read(): void
    {
        $this->syncAt('08:00');
        $this->scanIn()->assertSuccessful();

        $this->scanIn('2026-11-14T07:59:00+08:00')->assertStatus(400)
            ->assertJsonPath('message', 'Member already signed in.')->assertJsonPath('code', 'already_recorded');
        $this->scanOut()->assertStatus(403); // not yet open; unrelated, just proves sign-out has its own check
    }

    public function test_an_already_signed_out_replay_carries_the_same_code(): void
    {
        $this->syncAt('11:30');
        $this->scanOut()->assertSuccessful();

        $this->scanOut('2026-11-14T11:29:00+08:00')->assertStatus(400)->assertJsonPath('code', 'already_recorded');
    }

    public function test_the_log_says_when_a_scan_was_really_taken(): void
    {
        $this->syncAt('09:30');

        $this->scanIn('2026-11-14T08:55:00+08:00')->assertSuccessful();

        $log = ActivityLog::where('action', 'Time In')->latest('id')->first();
        $this->assertStringContainsString('(scanned offline at 8:55 AM, synced 9:30 AM)', $log->description);
        $this->assertSame($this->staff->user_code, $log->user_code);
    }

    public function test_a_normal_online_scan_has_no_offline_note_in_the_log(): void
    {
        $this->syncAt('08:00');

        $this->scanIn()->assertSuccessful();
        $this->scanIn('2026-11-14T07:59:30+08:00'); // refused as a duplicate, never logged twice

        $descriptions = ActivityLog::where('action', 'Time In')->pluck('description')->all();
        $this->assertCount(1, $descriptions);
        $this->assertStringNotContainsString('offline', $descriptions[0]);
    }

    public function test_a_resident_cannot_use_the_scan_time_to_check_themselves_in(): void
    {
        $this->syncAt('09:30');

        $this->scanIn('2026-11-14T08:55:00+08:00', $this->makeUser('Resident'))->assertStatus(403);
        $this->assertNull($this->stored('time_in'));
    }

    public function test_the_new_messages_are_translated(): void
    {
        $en = [
            'The scan time is in the future. Check the clock of the device that scanned.',
            'This scan is too old to sync (more than 72 hours). Record the attendance again.',
        ];
        foreach (['tl', 'ceb'] as $loc) {
            foreach ($en as $m) {
                $this->assertNotSame($m, \App\Support\ApiMessageTranslator::translate($m, $loc), "[$loc] $m");
            }
        }
    }
}

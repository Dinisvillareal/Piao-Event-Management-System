<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Event;
use App\Models\Membership;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support;
use Tests\TestCase;

/** The staff Dashboard's headline numbers must match what the rest of the system shows. */
class DashboardStatsTest extends TestCase
{
    use RefreshDatabase, Support;

    private function stats(?object $as = null): array
    {
        return $this->actingAs($as ?? $this->staff())->getJson('/dashboard/stats')->assertOk()->json();
    }

    private function event(string $start, ?string $end = null, string $name = 'Event'): Event
    {
        return Event::create([
            'name' => $name, 'description' => 'x', 'location' => 'Hall',
            'event_start' => $start, 'event_end' => $end,
            'call_time_start' => \Illuminate\Support\Carbon::parse($start)->subHour()->toDateTimeString(),
            'call_time_end' => \Illuminate\Support\Carbon::parse($end ?? $start)->addHour()->toDateTimeString(),
        ]);
    }

    private function log(string $code, string $at, string $action = 'Update'): void
    {
        $row = new ActivityLog();
        $row->forceFill(['user_code' => $code, 'action' => $action, 'module' => 'User', 'description' => 'x', 'created_at' => $at, 'updated_at' => $at])->save();
    }

    public function test_residents_can_not_read_the_staff_dashboard_numbers(): void
    {
        $this->actingAs($this->makeUser('Resident'))->getJson('/dashboard/stats')->assertForbidden();
    }

    public function test_guests_can_not_read_the_dashboard_numbers(): void
    {
        $this->getJson('/dashboard/stats')->assertUnauthorized();
    }

    public function test_the_residents_card_counts_residents_and_staff_but_not_archived_accounts(): void
    {
        $staff = $this->staff();
        $this->makeUser('Resident');
        $this->makeUser('Resident');
        $this->archived($this->makeUser('Resident'));       // archived: must not count
        $this->archived($this->makeUser('Staff'));          // archived staff: must not count

        $this->assertSame(3, $this->stats($staff)['residents']);   // 2 residents + the logged-in staff
    }

    public function test_the_memberships_card_counts_only_active_non_archived_memberships(): void
    {
        Membership::create(['name' => 'Seniors', 'description' => 'x', 'is_active' => true]);
        Membership::create(['name' => 'Youth', 'description' => 'x', 'is_active' => true]);
        Membership::create(['name' => 'Paused', 'description' => 'x', 'is_active' => false]);
        $this->archived(Membership::create(['name' => 'Gone', 'description' => 'x', 'is_active' => true]));

        $this->assertSame(2, $this->stats()['memberships']);
    }

    public function test_the_events_card_ignores_archived_events(): void
    {
        $this->event(now()->addDays(3)->toDateTimeString());
        $this->event(now()->subDays(3)->toDateTimeString());
        $this->archived($this->event(now()->addDays(5)->toDateTimeString()));

        $this->assertSame(2, $this->stats()['events']);
    }

    public function test_events_today_includes_one_that_already_started_and_one_that_spans_midnight(): void
    {
        $today = now()->startOfDay();
        $this->event($today->copy()->addHours(7)->toDateTimeString(), $today->copy()->addHours(23)->toDateTimeString(), 'Already started');
        $this->event($today->copy()->subDay()->addHours(20)->toDateTimeString(), $today->copy()->addHours(2)->toDateTimeString(), 'From last night');
        $this->event($today->copy()->addDay()->addHours(8)->toDateTimeString(), null, 'Tomorrow');
        $this->event($today->copy()->subDay()->addHours(8)->toDateTimeString(), $today->copy()->subDay()->addHours(10)->toDateTimeString(), 'Yesterday');
        $this->event($today->copy()->addHours(9)->toDateTimeString(), null, 'No end time');

        $this->assertSame(3, $this->stats()['events_today']);
    }

    public function test_staff_actions_today_is_not_capped_at_one_page_of_the_log(): void
    {
        $today = now()->startOfDay()->addHours(9)->toDateTimeString();
        foreach (range(1, 45) as $i) {
            $this->log($i % 2 ? 'PR-901' : 'PR-902', $today);
        }
        $this->log('PR-903', now()->subDays(2)->toDateTimeString());   // not today

        $stats = $this->stats();
        $this->assertSame(45, $stats['actions_today']);
        $this->assertSame(2, $stats['active_staff_today']);
    }

    public function test_the_last_action_is_the_newest_one_of_today(): void
    {
        $day = now()->startOfDay();
        $this->log('PR-901', $day->copy()->addHours(8)->toDateTimeString(), 'Create');
        $this->log('PR-902', $day->copy()->addHours(11)->toDateTimeString(), 'Delete');
        $this->log('PR-903', $day->copy()->subHours(3)->toDateTimeString(), 'Login');

        $last = $this->stats()['last_action'];
        $this->assertSame('Delete', $last['action']);
        $this->assertSame('PR-902', $last['user_code']);
    }

    public function test_a_quiet_day_reports_zeros_and_no_last_action(): void
    {
        $stats = $this->stats();
        $this->assertSame(0, $stats['actions_today']);
        $this->assertSame(0, $stats['active_staff_today']);
        $this->assertNull($stats['last_action']);
    }
}

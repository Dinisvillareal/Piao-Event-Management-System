<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventAttendance;
use App\Models\EventExpense;
use App\Models\InventoryItem;
use App\Models\Membership;
use App\Services\FacebookService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * When something unexpected breaks (a database error, a bug), the screen must show a
 * plain message only. The technical detail (SQL, table names, file paths) goes to the
 * server log. Messages written for staff, such as "Not enough stock", must still show.
 */
class ErrorTextHidingTest extends TestCase
{
    use RefreshDatabase, Support;

    /** What a real database failure looks like -- none of this may reach the browser. */
    private const SECRET = "SQLSTATE[42S02]: Base table or view not found: 1146 Table 'piao_db.secret_table' doesn't exist (Connection: mysql, SQL: insert into `secret_table`)";

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
    }

    private function assertNoLeak($response): void
    {
        $body = $response->getContent();
        foreach (['SQLSTATE', 'secret_table', 'piao_db', 'Connection: mysql', 'insert into'] as $needle) {
            $this->assertStringNotContainsString($needle, $body, "'{$needle}' reached the browser");
        }
    }

    private function eventPayload(array $extra = []): array
    {
        return array_merge([
            'name' => 'Clean-up', 'description' => 'Drive', 'location' => 'Plaza',
            'event_start' => now()->addHours(4)->toDateTimeString(), 'event_end' => now()->addHours(6)->toDateTimeString(),
            'call_time_start' => now()->addHour()->toDateTimeString(), 'call_time_end' => now()->addHours(7)->toDateTimeString(),
        ], $extra);
    }

    // ---------------------------------------------------------------- events

    public function test_a_database_failure_while_creating_an_event_shows_a_plain_message_and_is_logged(): void
    {
        Log::spy();
        Event::creating(fn () => throw new \RuntimeException(self::SECRET));

        $res = $this->actingAs($this->staff())->postJson('/events', $this->eventPayload())->assertStatus(500);

        $this->assertNoLeak($res);
        $this->assertSame('Failed to create event: Something went wrong. Please try again.', $res->json('message'));
        Log::shouldHaveReceived('error')->withArgs(fn ($msg) => str_contains((string) $msg, 'secret_table'))->once();
    }

    public function test_the_plain_message_is_translated_for_tagalog_and_bisaya_users(): void
    {
        Event::creating(fn () => throw new \RuntimeException(self::SECRET));
        $staff = $this->staff();

        foreach (['tl', 'ceb'] as $lang) {
            $res = $this->actingAs($staff)->withHeader('X-Lang', $lang)->postJson('/events', $this->eventPayload())->assertStatus(500);

            $this->assertNoLeak($res);
            $this->assertStringNotContainsString('Something went wrong', $res->json('message'), "not translated for {$lang}");
        }
    }

    public function test_a_stock_shortage_while_creating_an_event_is_still_shown_to_staff(): void
    {
        $chairs = InventoryItem::create(['name' => 'Chairs', 'quantity' => 12, 'new_quantity' => 0, 'good_quantity' => 12, 'fair_quantity' => 0, 'poor_quantity' => 0]);

        $res = $this->actingAs($this->staff())->postJson('/events', $this->eventPayload([
            'borrowed_items' => [['inventory_item_id' => $chairs->id, 'quantity' => 20]],
        ]))->assertStatus(500);

        $this->assertStringContainsString('Not enough stock for "Chairs" (available: 12, requested: 20)', $res->json('message'));
        $this->assertSame(0, Event::count(), 'the whole event is cancelled');
    }

    // ---------------------------------------------------------------- scanning

    public function test_a_failed_scan_shows_only_a_plain_message(): void
    {
        $staff = $this->staff();
        $resident = $this->makeUser('Resident');
        $event = Event::create([
            'name' => 'Assembly', 'description' => 'Test', 'location' => 'Hall',
            'event_start' => now()->addHours(3), 'event_end' => now()->addHours(5),
            'call_time_start' => now()->subHour(), 'call_time_end' => now()->addHours(6),
        ]);
        EventAttendance::where('event_id', $event->id)->delete();
        EventAttendance::creating(fn () => throw new \RuntimeException(self::SECRET));

        $res = $this->actingAs($staff)->postJson('/attendance/time-in', ['event_id' => $event->id, 'user_id' => $resident->id]);

        $this->assertSame(500, $res->status(), $res->getContent());
        $this->assertNoLeak($res);
        $this->assertSame('Time-in failed', $res->json('message'));
        $this->assertSame('Something went wrong. Please try again.', $res->json('error'));
    }

    public function test_signing_out_twice_is_refused_and_leaves_no_open_transaction(): void
    {
        $staff = $this->staff();
        $resident = $this->makeUser('Resident');
        $event = Event::create([
            'name' => 'Assembly', 'description' => 'Test', 'location' => 'Hall',
            'event_start' => now()->subHours(3), 'event_end' => now()->subHour(),
            'call_time_start' => now()->subHours(4), 'call_time_end' => now()->addHours(2),
        ]);
        EventAttendance::updateOrCreate(
            ['event_id' => $event->id, 'user_id' => $resident->id],
            ['time_in' => now()->subHours(3), 'time_out' => now()->subMinutes(10), 'status' => 'Complete']
        );
        $before = DB::transactionLevel();

        $res = $this->actingAs($staff)->putJson('/attendance/time-out', ['event_id' => $event->id, 'user_id' => $resident->id]);

        $this->assertSame(400, $res->status(), $res->getContent());
        $this->assertSame('Member already signed out.', $res->json('message'));
        $this->assertSame($before, DB::transactionLevel(), 'the refused sign-out left a transaction open');
    }

    // ---------------------------------------------------------------- memberships

    public function test_a_failure_creating_a_membership_shows_a_plain_message(): void
    {
        Membership::creating(fn () => throw new \RuntimeException(self::SECRET));

        $res = $this->actingAs($this->staff())->postJson('/api/memberships', ['name' => 'Farmers'])->assertStatus(500);

        $this->assertNoLeak($res);
        $this->assertSame('Failed to create membership', $res->json('message'));
        $this->assertSame('Something went wrong. Please try again.', $res->json('error'));
    }

    // ---------------------------------------------------------------- archive, even with debug on

    public function test_the_archive_never_shows_the_technical_text_even_when_debug_is_on(): void
    {
        config(['app.debug' => true]);
        $staff = $this->staff();
        $event = Event::create([
            'name' => 'Assembly', 'description' => 'Test', 'location' => 'Hall',
            'event_start' => now()->addHours(3), 'event_end' => now()->addHours(5),
        ]);
        $x = $event->expenses()->create(['item' => 'Food', 'amount' => 100, 'receipt_path' => 'r.jpg']);
        $x->delete();
        EventExpense::restoring(fn () => throw new \RuntimeException(self::SECRET));

        $res = $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'expense', 'id' => $x->id])->assertStatus(500);

        $this->assertNoLeak($res);
        $this->assertSame('Something went wrong. Please try again.', $res->json('message'));
    }

    // ---------------------------------------------------------------- facebook

    public function test_a_facebook_network_failure_does_not_expose_the_technical_text(): void
    {
        app(FacebookService::class)->connect('1234567890', 'TOKEN-abc');
        Http::fake(fn () => throw new ConnectionException('cURL error 6: Could not resolve host: graph.facebook.com for https://graph.facebook.com/v19.0/1234567890/feed'));

        [$ok, $message] = app(FacebookService::class)->postEvent('Title', 'Body');

        $this->assertFalse($ok);
        $this->assertSame('Could not reach Facebook. Please try again later.', $message);
        $this->assertStringNotContainsString('1234567890', $message);
        $this->assertStringNotContainsString('cURL', $message);
    }
}

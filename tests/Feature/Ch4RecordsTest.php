<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\InventoryItem;
use App\Models\InventoryUnitLog;
use App\Models\Membership;
use App\Models\GeneratedReport;
use App\Models\ActivityLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/** Chapter IV – residents, attendance, budget, inventory, reports, access (TC-15 … TC-64). */
class Ch4RecordsTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
    }

    private function event(array $extra = []): Event
    {
        return Event::create(array_merge([
            'name' => 'Assembly', 'description' => 'Test', 'location' => 'Barangay Hall',
            'event_start' => now()->addHours(3), 'event_end' => now()->addHours(5),
            'call_time_start' => now()->subHour(), 'call_time_end' => now()->addHours(6),
        ], $extra));
    }

    // ---------------------------------------------------------------- residents
    private function residentPayload(array $o = []): array
    {
        return array_merge([
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'contact_number' => '09171234567',
            'role' => 'Resident', 'has_account' => true,
            'password' => 'Passw0rd!Strong#1', 'password_confirmation' => 'Passw0rd!Strong#1',
        ], $o);
    }

    public function test_tc15_staff_registers_a_resident_with_valid_details(): void
    {
        $s = $this->staff();
        $this->actingAs($s)->postJson('/users', $this->residentPayload())->assertStatus(201);
        $this->assertDatabaseHas('users', ['first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'role' => 'Resident']);
    }

    public function test_tc16_invalid_contact_number_is_rejected(): void
    {
        $s = $this->staff();
        $this->actingAs($s)->postJson('/users', $this->residentPayload(['contact_number' => '0812']))
            ->assertStatus(422)->assertJsonValidationErrors('contact_number');
    }

    public function test_tc17_duplicate_resident_is_refused(): void
    {
        $s = $this->staff();
        $this->actingAs($s)->postJson('/users', $this->residentPayload())->assertStatus(201);
        $this->actingAs($s)->postJson('/users', $this->residentPayload(['contact_number' => '09179999999']))->assertStatus(422);
        $this->assertSame(1, \App\Models\User::where('first_name', 'Juan')->count());
    }

    public function test_tc18_resident_cannot_register_residents(): void
    {
        $r = $this->makeUser('Resident');
        $this->actingAs($r)->postJson('/users', $this->residentPayload())->assertStatus(403);
    }

    public function test_tc24_archive_then_restore_a_resident(): void
    {
        $s = $this->staff();
        $r = $this->makeUser('Resident');
        $this->actingAs($s)->deleteJson("/users/{$r->id}")->assertOk();
        $this->assertSoftDeleted('users', ['id' => $r->id]);
        $this->actingAs($s)->postJson("/users/{$r->id}/restore")->assertOk();
        $this->assertNotSoftDeleted('users', ['id' => $r->id]);
    }

    public function test_tc24b_a_staff_member_cannot_archive_their_own_account(): void
    {
        $s = $this->staff();
        $this->actingAs($s)->deleteJson("/users/{$s->id}")->assertStatus(422);
    }

    // ---------------------------------------------------------------- attendance
    public function test_tc27_valid_scan_records_sign_in(): void
    {
        $s = $this->staff(); $r = $this->makeUser('Resident'); $e = $this->event();
        $this->actingAs($s)->postJson('/attendance/time-in', ['event_id' => $e->id, 'user_id' => $r->id])->assertSuccessful();
        $this->assertNotNull(\App\Models\EventAttendance::where(['event_id' => $e->id, 'user_id' => $r->id])->first()->time_in);
    }

    public function test_tc28_second_scan_of_the_same_qr_is_flagged(): void
    {
        $s = $this->staff(); $r = $this->makeUser('Resident'); $e = $this->event();
        $this->actingAs($s)->postJson('/attendance/time-in', ['event_id' => $e->id, 'user_id' => $r->id])->assertSuccessful();
        $this->actingAs($s)->postJson('/attendance/time-in', ['event_id' => $e->id, 'user_id' => $r->id])->assertStatus(400);
        $this->assertSame(1, \App\Models\EventAttendance::where(['event_id' => $e->id, 'user_id' => $r->id])->count());
    }

    public function test_tc29_ineligible_member_is_refused(): void
    {
        $s = $this->staff(); $r = $this->makeUser('Resident');
        $m = Membership::create(['name' => 'Seniors', 'description' => 'x']);
        $e = $this->event(['membership_ids' => [$m->id]]);
        $this->actingAs($s)->postJson('/attendance/time-in', ['event_id' => $e->id, 'user_id' => $r->id])->assertStatus(403);
    }

    public function test_tc29b_scan_after_the_sign_in_window_is_refused(): void
    {
        $s = $this->staff(); $r = $this->makeUser('Resident');
        $e = $this->event(['event_start' => now()->subHour(), 'event_end' => now()->addHour(), 'call_time_start' => now()->subHours(3)]);
        $this->actingAs($s)->postJson('/attendance/time-in', ['event_id' => $e->id, 'user_id' => $r->id])->assertStatus(403);
    }

    public function test_tc29c_resident_cannot_scan_attendance(): void
    {
        $r = $this->makeUser('Resident'); $e = $this->event();
        $this->actingAs($r)->postJson('/attendance/time-in', ['event_id' => $e->id, 'user_id' => $r->id])->assertStatus(403);
    }

    public function test_tc31_posting_an_event_creates_attendance_for_every_eligible_member(): void
    {
        $s = $this->staff(); $a = $this->makeUser('Resident'); $b = $this->makeUser('Resident');
        $this->actingAs($s)->postJson('/events', [
            'name' => 'Clean-up', 'description' => 'Drive', 'location' => 'Plaza',
            'event_start' => now()->addHours(4)->toDateTimeString(), 'event_end' => now()->addHours(6)->toDateTimeString(),
            'call_time_start' => now()->addHour()->toDateTimeString(), 'call_time_end' => now()->addHours(7)->toDateTimeString(),
        ])->assertSuccessful();
        $ev = Event::where('name', 'Clean-up')->first();
        $this->assertNotNull($ev);
        $this->assertDatabaseHas('attendances', ['event_id' => $ev->id, 'user_id' => $a->id, 'status' => 'missed']);
        $this->assertDatabaseHas('attendances', ['event_id' => $ev->id, 'user_id' => $b->id, 'status' => 'missed']);
    }

    public function test_tc32_resident_cannot_post_events(): void
    {
        $r = $this->makeUser('Resident');
        $this->actingAs($r)->postJson('/events', ['name' => 'X'])->assertStatus(403);
    }

    // ---------------------------------------------------------------- budget
    public function test_tc43_expense_with_receipt_updates_the_totals(): void
    {
        $s = $this->staff(); $e = $this->event(['approved_budget' => 1000]);
        $res = $this->actingAs($s)->post("/events/{$e->id}/expenses", [
            'item' => 'Tarpaulin', 'amount' => 400, 'receipt' => UploadedFile::fake()->image('r.jpg'),
        ], ['Accept' => 'application/json'])->assertStatus(201);
        $this->assertEquals(400, $res->json('total_expenses'));
        $this->assertEquals(600, $res->json('remaining'));
        $this->assertFalse($res->json('is_over_budget'));
    }

    public function test_tc44_over_budget_is_flagged(): void
    {
        $s = $this->staff(); $e = $this->event(['approved_budget' => 300]);
        $res = $this->actingAs($s)->post("/events/{$e->id}/expenses", [
            'item' => 'Sound system', 'amount' => 500, 'receipt' => UploadedFile::fake()->image('r.jpg'),
        ], ['Accept' => 'application/json'])->assertStatus(201);
        $this->assertTrue($res->json('is_over_budget'));
        $this->assertEquals(200, $res->json('over_by'));
    }

    public function test_tc44b_expense_without_receipt_is_rejected(): void
    {
        $s = $this->staff(); $e = $this->event();
        $this->actingAs($s)->postJson("/events/{$e->id}/expenses", ['item' => 'x', 'amount' => 5])->assertStatus(422);
    }

    public function test_tc46_expenses_cannot_be_added_to_a_finished_event(): void
    {
        $s = $this->staff();
        $e = $this->event(['event_start' => now()->subDays(2), 'event_end' => now()->subDay(), 'call_time_start' => now()->subDays(3), 'call_time_end' => now()->subDay()]);
        $res = $this->actingAs($s)->post("/events/{$e->id}/expenses", [
            'item' => 'Late receipt', 'amount' => 50, 'receipt' => UploadedFile::fake()->image('r.jpg'),
        ], ['Accept' => 'application/json']);
        $this->assertContains($res->status(), [403, 422], 'a finished event must not accept new expenses (got ' . $res->status() . ')');
    }

    public function test_tc46b_expenses_of_a_finished_event_cannot_be_edited_or_removed(): void
    {
        $s = $this->staff();
        $e = $this->event();
        $this->actingAs($s)->post("/events/{$e->id}/expenses", [
            'item' => 'Tarpaulin', 'amount' => 100, 'receipt' => UploadedFile::fake()->image('r.jpg'),
        ], ['Accept' => 'application/json'])->assertStatus(201);
        $expense = $e->expenses()->first();
        // the event now ends
        $e->forceFill(['event_start' => now()->subDays(2), 'event_end' => now()->subDay(), 'call_time_start' => now()->subDays(3), 'call_time_end' => now()->subDay()])->save();
        $this->actingAs($s)->putJson("/events/{$e->id}/expenses/{$expense->id}", ['item' => 'Changed', 'amount' => 999])->assertStatus(422);
        $this->actingAs($s)->deleteJson("/events/{$e->id}/expenses/{$expense->id}")->assertStatus(422);
        $this->assertSame('Tarpaulin', $expense->fresh()->item);
        $this->assertSame(1, $e->expenses()->count());
        // history stays readable
        $this->actingAs($s)->getJson("/events/{$e->id}/expenses")->assertOk();
    }

    public function test_tc45_budget_cannot_be_changed_after_the_event_has_ended(): void
    {
        $s = $this->staff();
        $e = $this->event(['event_start' => now()->subDays(2), 'event_end' => now()->subDay(), 'call_time_start' => now()->subDays(3), 'call_time_end' => now()->subDay()]);
        $res = $this->actingAs($s)->putJson("/events/{$e->id}/budget", ['approved_budget' => 5000]);
        $this->assertContains($res->status(), [403, 422]);
    }

    // ---------------------------------------------------------------- inventory
    public function test_tc47_item_total_equals_the_sum_of_conditions(): void
    {
        $s = $this->staff();
        $res = $this->actingAs($s)->post('/inventory', [
            'name' => 'Chairs', 'quantity' => 0, 'new_quantity' => 5, 'good_quantity' => 10, 'fair_quantity' => 3, 'poor_quantity' => 2,
            'photo' => UploadedFile::fake()->image('c.jpg'),
        ], ['Accept' => 'application/json'])->assertStatus(201);
        $this->assertSame(20, (int) InventoryItem::first()->quantity);
    }

    public function test_tc48_negative_counts_are_rejected(): void
    {
        $s = $this->staff();
        $this->actingAs($s)->postJson('/inventory', ['name' => 'Chairs', 'quantity' => -3])->assertStatus(422);
        $this->actingAs($s)->postJson('/inventory', ['name' => 'Chairs', 'quantity' => 5, 'good_quantity' => -1])->assertStatus(422);
    }

    public function test_tc52_found_units_are_kept_on_the_item_and_never_credited_to_an_event(): void
    {
        $s = $this->staff();
        $item = InventoryItem::create(['name' => 'Tents', 'quantity' => 0, 'new_quantity' => 0, 'good_quantity' => 0, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $item->forceFill(['lost_quantity' => 5])->save();
        $first = $this->event(['name' => 'Fiesta']); $second = $this->event(['name' => 'Sports Fest']);
        InventoryUnitLog::create(['inventory_item_id' => $item->id, 'event_id' => $first->id, 'action' => 'lost', 'quantity' => 2, 'units' => ['New' => 0, 'Good' => 2, 'Fair' => 0, 'Poor' => 0]]);
        InventoryUnitLog::create(['inventory_item_id' => $item->id, 'event_id' => $second->id, 'action' => 'lost', 'quantity' => 3, 'units' => ['New' => 0, 'Good' => 3, 'Fair' => 0, 'Poor' => 0]]);

        $this->actingAs($s)->post("/inventory/{$item->id}/units", [
            'action' => 'found', 'units' => ['Good' => 3], 'photos' => [UploadedFile::fake()->image('p.jpg')],
        ], ['Accept' => 'application/json'])->assertSuccessful();

        // one found report, on the item only: no event is credited
        $found = InventoryUnitLog::where('inventory_item_id', $item->id)->where('action', 'found')->get();
        $this->assertCount(1, $found);
        $this->assertNull($found->first()->event_id);
        $this->assertSame(3, (int) $found->first()->quantity);
        // the item shows what is still missing
        $this->assertSame(2, (int) $item->fresh()->lost_quantity);
        $summary = $this->actingAs($s)->getJson("/inventory/{$item->id}/unit-logs")->assertOk()->json('summary');
        $this->assertSame(['lost' => 5, 'recovered' => 3, 'missing' => 2], $summary);
        // each event keeps its loss exactly as recorded at return
        foreach ([$first->id => 2, $second->id => 3] as $eid => $lost) {
            $tab = $this->actingAs($s)->getJson("/events/{$eid}/inventory")->assertOk()->json('items');
            $this->assertSame($lost, (int) collect($tab)->firstWhere('inventory_item_id', $item->id)['lost']);
            $this->assertSame(0, (int) collect($tab)->firstWhere('inventory_item_id', $item->id)['returned']);
        }
    }

    public function test_tc52b_found_units_need_an_evidence_photo(): void
    {
        $s = $this->staff();
        $item = InventoryItem::create(['name' => 'Tents', 'quantity' => 0]);
        $this->actingAs($s)->postJson("/inventory/{$item->id}/units", ['action' => 'found', 'units' => ['Good' => 1]])->assertStatus(422);
    }

    public function test_tc47b_resident_cannot_use_inventory(): void
    {
        $r = $this->makeUser('Resident');
        $this->actingAs($r)->getJson('/inventory')->assertStatus(403);
    }

    // ---------------------------------------------------------------- reports
    public function test_tc54_staff_opens_the_live_report_summaries(): void
    {
        $s = $this->staff();
        // attendance-summary uses MySQL-only SQL (TIMESTAMPDIFF), so it is covered by the manual run on MySQL.
        foreach (['membership-summary', 'budget-summary', 'inventory-summary', 'pulse'] as $p) {
            $this->actingAs($s)->getJson("/reports/{$p}")->assertOk();
        }
    }

    public function test_tc56_csv_export_works_and_is_recorded_in_report_history(): void
    {
        $s = $this->staff();
        $this->actingAs($s)->get('/reports/export/csv?type=membership')->assertOk();
        $this->assertSame(1, GeneratedReport::where(['user_code' => $s->user_code, 'format' => 'csv'])->count());
        $this->actingAs($s)->getJson('/reports/history')->assertOk();
    }

    public function test_tc55_pdf_export_returns_a_pdf(): void
    {
        $s = $this->staff();
        $res = $this->actingAs($s)->get('/reports/export/pdf?type=membership')->assertOk();
        $this->assertStringContainsString('pdf', strtolower((string) $res->headers->get('content-type')));
    }

    public function test_tc59_residents_cannot_open_reports_or_history(): void
    {
        $r = $this->makeUser('Resident');
        foreach (['/reports/pulse', '/reports/history', '/reports/export/csv?type=membership', '/reports/export/pdf?type=membership'] as $u) {
            $this->actingAs($r)->getJson($u)->assertStatus(403);
        }
    }

    // ---------------------------------------------------------------- audit / access
    public function test_tc62_activity_log_is_staff_only_and_records_actions(): void
    {
        $s = $this->staff(); $r = $this->makeUser('Resident');
        $this->actingAs($s)->postJson('/users', $this->residentPayload())->assertStatus(201);
        $this->assertGreaterThan(0, ActivityLog::count());
        $this->actingAs($s)->getJson('/activity-logs')->assertOk();
        $this->actingAs($r)->getJson('/activity-logs')->assertStatus(403);
    }

    public function test_tc63_unauthenticated_visitors_cannot_reach_protected_data(): void
    {
        foreach (['/me', '/users', '/inventory', '/reports/pulse', '/staff-accounts', '/activity-logs'] as $u) {
            $this->getJson($u)->assertStatus(401);
        }
    }
}

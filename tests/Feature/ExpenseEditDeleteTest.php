<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Event;
use App\Models\EventExpense;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * Editing or deleting an expense must move the event's budget figures by exactly the
 * right amount, leave an audit trail, never lose a receipt, and respect who may do it.
 */
class ExpenseEditDeleteTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
    }

    private function event(float $budget = 10000, array $extra = []): Event
    {
        return Event::create(array_merge([
            'name' => 'Fiesta', 'description' => 'Test', 'location' => 'Barangay Hall',
            'event_start' => now()->addHours(3), 'event_end' => now()->addHours(5),
            'call_time_start' => now()->subHour(), 'call_time_end' => now()->addHours(6),
            'approved_budget' => $budget,
        ], $extra));
    }

    private function add(Event $e, string $item, $amount, $staff = null): EventExpense
    {
        $res = $this->actingAs($staff ?? $this->staff())->post("/events/{$e->id}/expenses", [
            'item' => $item, 'amount' => $amount, 'receipt' => $this->fakeImage('r.jpg'),
        ], ['Accept' => 'application/json'])->assertStatus(201);

        return EventExpense::findOrFail($res->json('expense.id'));
    }

    /** PUT with files has to be sent as a multipart POST with _method, like the app does. */
    private function edit(Event $e, EventExpense $x, array $data, $staff = null)
    {
        return $this->actingAs($staff ?? $this->staff())->post(
            "/events/{$e->id}/expenses/{$x->id}", $data + ['_method' => 'PUT'], ['Accept' => 'application/json']
        );
    }

    private function trail(EventExpense $x): array
    {
        return $x->fresh()->activity_log ?? [];
    }

    // ---------------------------------------------------------------- totals follow edits

    public function test_editing_an_amount_moves_the_totals_by_exactly_the_difference(): void
    {
        $e = $this->event(10000);
        $x = $this->add($e, 'Sound system', 4000);
        $this->add($e, 'Tarpaulin', 1000);

        $res = $this->edit($e, $x, ['item' => 'Sound system', 'amount' => 4500])->assertOk();

        $this->assertEquals(5500, $res->json('total_expenses'));
        $this->assertEquals(4500, $res->json('remaining'));
        $this->assertFalse($res->json('is_over_budget'));
        $this->assertEquals(4500, $x->fresh()->amount);
    }

    public function test_an_edit_can_push_the_event_over_budget_and_back_under(): void
    {
        $e = $this->event(10000);
        $x = $this->add($e, 'Stage', 9000);

        $over = $this->edit($e, $x, ['item' => 'Stage', 'amount' => 11000])->assertOk();
        $this->assertTrue($over->json('is_over_budget'));
        $this->assertEquals(1000, $over->json('over_by'));
        $this->assertEquals(-1000, $over->json('remaining'));
        $this->assertTrue(ActivityLog::where('description', 'like', '%over its approved budget%')->exists());

        $back = $this->edit($e, $x, ['item' => 'Stage', 'amount' => 9000])->assertOk();
        $this->assertFalse($back->json('is_over_budget'));
        $this->assertEquals(0, $back->json('over_by'));
        $this->assertEquals(1000, $back->json('remaining'));
        $this->assertTrue(ActivityLog::where('description', 'like', '%back within its approved budget%')->exists());
    }

    public function test_the_budget_report_shows_the_edited_amount_not_the_old_one(): void
    {
        $e = $this->event(10000);
        $x = $this->add($e, 'Food', 2000);
        $this->edit($e, $x, ['item' => 'Food', 'amount' => 2750.50])->assertOk();

        $row = collect($this->actingAs($this->staff())->getJson('/reports/budget-summary')->json('per_event'))->firstWhere('name', 'Fiesta');

        $this->assertEquals(2750.50, $row['total_expenses']);
        $this->assertEquals(7249.50, $row['remaining']);
    }

    // ---------------------------------------------------------------- delete

    public function test_deleting_an_expense_takes_it_out_of_the_totals_and_reports(): void
    {
        $e = $this->event(10000);
        $this->add($e, 'Food', 4000);
        $snack = $this->add($e, 'Snacks', 500);

        $res = $this->actingAs($this->staff())->deleteJson("/events/{$e->id}/expenses/{$snack->id}")->assertOk();

        $this->assertEquals(4000, $res->json('total_expenses'));
        $this->assertEquals(6000, $res->json('remaining'));
        $row = collect($this->actingAs($this->staff())->getJson('/reports/budget-summary')->json('per_event'))->firstWhere('name', 'Fiesta');
        $this->assertEquals(4000, $row['total_expenses']);
        $this->assertSame(1, $row['expense_count']);
    }

    public function test_a_deleted_expense_is_kept_in_the_database_and_can_be_recovered(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Snacks', 500);

        $this->actingAs($this->staff())->deleteJson("/events/{$e->id}/expenses/{$x->id}")->assertOk();

        $this->assertNull(EventExpense::find($x->id));
        $this->assertNotNull(EventExpense::withTrashed()->find($x->id));
        Storage::disk('public')->assertExists($x->receipt_path);   // the receipt file stays too
    }

    public function test_deleting_the_expense_that_made_an_event_over_budget_says_it_is_back_within(): void
    {
        $e = $this->event(1000);
        $x = $this->add($e, 'Sound system', 1500);

        $res = $this->actingAs($this->staff())->deleteJson("/events/{$e->id}/expenses/{$x->id}")->assertOk();

        $this->assertFalse($res->json('is_over_budget'));
        $this->assertEquals(1000, $res->json('remaining'));
        $this->assertTrue(ActivityLog::where('action', 'Delete')->where('description', 'like', '%back within its approved budget%')->exists());
    }

    // ---------------------------------------------------------------- archive and restore

    public function test_a_deleted_expense_shows_up_in_the_archive_as_an_expense(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Snacks', 500);
        $this->actingAs($this->staff())->deleteJson("/events/{$e->id}/expenses/{$x->id}")->assertOk();

        $row = collect($this->actingAs($this->staff())->getJson('/api/archived')->json())
            ->first(fn ($r) => $r['type'] === 'expense' && $r['id'] === $x->id);

        $this->assertNotNull($row, 'the deleted expense is listed in the Archive');
        $this->assertSame('Snacks', $row['name']);
    }

    public function test_restoring_an_expense_while_the_event_is_running_brings_the_money_back(): void
    {
        $e = $this->event(10000);
        $this->add($e, 'Food', 4000);
        $snack = $this->add($e, 'Snacks', 500);
        $staff = $this->staff();
        $this->actingAs($staff)->deleteJson("/events/{$e->id}/expenses/{$snack->id}")->assertOk();
        $this->assertEquals(4000, $e->fresh()->total_expenses);

        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'expense', 'id' => $snack->id])->assertOk();

        $this->assertNull($snack->fresh()->deleted_at);
        $this->assertEquals(4500, $e->fresh()->total_expenses);
        $this->assertTrue(ActivityLog::where('action', 'Restore')->where('description', 'like', "%Snacks%")->exists());
    }

    public function test_an_expense_cannot_be_restored_into_an_event_that_has_ended(): void
    {
        $e = $this->event(10000);
        $this->add($e, 'Food', 4000);
        $snack = $this->add($e, 'Snacks', 500);
        $staff = $this->staff();
        $this->actingAs($staff)->deleteJson("/events/{$e->id}/expenses/{$snack->id}")->assertOk();

        // The event finishes; its books are now closed.
        $e->update(['event_start' => now()->subDays(2), 'event_end' => now()->subDay(), 'call_time_start' => now()->subDays(2)->subHour(), 'call_time_end' => now()->subDay()]);

        $res = $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'expense', 'id' => $snack->id])->assertStatus(422);

        $this->assertStringContainsString('already ended', (string) $res->json('message'));
        $this->assertNotNull(EventExpense::withTrashed()->find($snack->id)->deleted_at, 'still archived');
        $this->assertEquals(4000, $e->fresh()->total_expenses, 'the closed total did not change');
        $this->assertFalse(ActivityLog::where('action', 'Restore')->exists());
    }

    public function test_residents_cannot_restore_expenses(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Snacks', 500);
        $this->actingAs($this->staff())->deleteJson("/events/{$e->id}/expenses/{$x->id}")->assertOk();

        $this->actingAs($this->makeUser('Resident'))->postJson('/api/archive/restore', ['type' => 'expense', 'id' => $x->id])->assertStatus(403);

        $this->assertNotNull(EventExpense::withTrashed()->find($x->id)->deleted_at);
    }

    // ---------------------------------------------------------------- the audit trail

    public function test_an_edit_is_logged_with_what_changed_who_did_it_and_when(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Sound system', 4000);
        $staff = $this->staff();

        $this->edit($e, $x, ['item' => 'Sound system rental', 'amount' => 4500, 'notes' => 'Added speakers'], $staff)->assertOk();

        $entry = $this->trail($x)[0];
        $this->assertSame($staff->user_code, $entry['by']);
        $this->assertNotEmpty($entry['at']);
        $changes = collect($entry['changes'])->keyBy('field');
        $this->assertSame(['from' => 'Sound system', 'to' => 'Sound system rental'], ['from' => $changes['item']['from'], 'to' => $changes['item']['to']]);
        $this->assertSame(['from' => '4000.00', 'to' => '4500.00'], ['from' => $changes['amount']['from'], 'to' => $changes['amount']['to']]);
        $this->assertSame('Added speakers', $changes['notes']['to']);

        $this->assertTrue(ActivityLog::where('module', 'Budget')->where('description', 'like', '%PHP 4,000.00 -> PHP 4,500.00%')->exists());
    }

    public function test_saving_without_changing_anything_adds_nothing_to_the_trail(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Food', 800);

        $this->edit($e, $x, ['item' => 'Food', 'amount' => 800])->assertOk();

        $this->assertSame([], $this->trail($x));
    }

    public function test_several_edits_build_a_trail_in_order(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Food', 800);

        $this->edit($e, $x, ['item' => 'Food', 'amount' => 900])->assertOk();
        $this->edit($e, $x, ['item' => 'Food', 'amount' => 950])->assertOk();

        $trail = $this->trail($x);
        $this->assertCount(2, $trail);
        $this->assertSame('900.00', $trail[0]['changes'][0]['to']);
        $this->assertSame('950.00', $trail[1]['changes'][0]['to']);
    }

    // ---------------------------------------------------------------- receipts

    public function test_a_receipt_can_never_be_removed_without_a_replacement(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Food', 800);
        $path = $x->receipt_path;

        $this->edit($e, $x, ['item' => 'Food', 'amount' => 800, 'remove_receipt' => true])->assertStatus(422);
        $this->edit($e, $x, ['item' => 'Food', 'amount' => 800, 'receipts_sync' => true, 'keep_receipts' => []])->assertStatus(422);

        $this->assertSame($path, $x->fresh()->receipt_path);
        Storage::disk('public')->assertExists($path);
    }

    public function test_replacing_a_receipt_keeps_the_old_file_and_lists_it_in_the_history(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Food', 800);
        $old = $x->receipt_path;

        $this->edit($e, $x, ['item' => 'Food', 'amount' => 800, 'receipt' => $this->fakeImage('new.jpg')])->assertOk();

        $x = $x->fresh();
        $this->assertNotSame($old, $x->receipt_path);
        Storage::disk('public')->assertExists($old);                    // the old proof is not thrown away
        Storage::disk('public')->assertExists($x->receipt_path);
        $entry = $this->trail($x)[0];
        $this->assertContains($old, $entry['photos']);
        $this->assertContains($x->receipt_path, $entry['added']);
    }

    public function test_receipts_can_be_swapped_through_the_photo_list_and_the_removed_one_stays_in_history(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Food', 800);
        $old = $x->receipt_path;

        $this->edit($e, $x, [
            'item' => 'Food', 'amount' => 800, 'receipts_sync' => true, 'keep_receipts' => [],
            'receipts' => [$this->fakeImage('a.jpg'), $this->fakeImage('b.jpg')],
        ])->assertOk();

        $x = $x->fresh();
        $this->assertCount(2, $x->allReceiptPaths());
        $this->assertNotContains($old, $x->allReceiptPaths());
        Storage::disk('public')->assertExists($old);
        $this->assertContains($old, $this->trail($x)[0]['photos']);
    }

    // ---------------------------------------------------------------- scope and access

    public function test_an_expense_cannot_be_edited_or_deleted_through_another_event(): void
    {
        $fiesta = $this->event(10000);
        $other = $this->event(5000, ['name' => 'Sports Fest']);
        $x = $this->add($fiesta, 'Food', 800);

        $this->edit($other, $x, ['item' => 'Hacked', 'amount' => 1])->assertStatus(404);
        $this->actingAs($this->staff())->deleteJson("/events/{$other->id}/expenses/{$x->id}")->assertStatus(404);

        $x = $x->fresh();
        $this->assertSame('Food', $x->item);
        $this->assertEquals(800, $x->amount);
        $this->assertNull($x->deleted_at);
    }

    public function test_residents_and_visitors_cannot_edit_or_delete_expenses(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Food', 800);
        $resident = $this->makeUser('Resident');

        $this->edit($e, $x, ['item' => 'Changed', 'amount' => 1], $resident)->assertStatus(403);
        $this->actingAs($resident)->deleteJson("/events/{$e->id}/expenses/{$x->id}")->assertStatus(403);
        auth()->logout();
        $this->deleteJson("/events/{$e->id}/expenses/{$x->id}")->assertStatus(401);

        $this->assertSame('Food', $x->fresh()->item);
        $this->assertNull($x->fresh()->deleted_at);
    }

    public function test_an_expense_of_an_ended_event_cannot_be_edited_or_deleted(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Food', 800);
        $e->update(['event_start' => now()->subDays(2), 'event_end' => now()->subDay(), 'call_time_start' => now()->subDays(2)->subHour(), 'call_time_end' => now()->subDay()]);

        $this->edit($e, $x, ['item' => 'Food', 'amount' => 900])->assertStatus(422);
        $this->actingAs($this->staff())->deleteJson("/events/{$e->id}/expenses/{$x->id}")->assertStatus(422);

        $this->assertEquals(800, $x->fresh()->amount);
        $this->assertNull($x->fresh()->deleted_at);
    }

    public function test_a_failed_edit_leaves_the_expense_and_its_trail_untouched(): void
    {
        $e = $this->event();
        $x = $this->add($e, 'Food', 800);

        $this->edit($e, $x, ['item' => 'Food', 'amount' => 0])->assertStatus(422);
        $this->edit($e, $x, ['item' => '', 'amount' => 900])->assertStatus(422);

        $this->assertEquals(800, $x->fresh()->amount);
        $this->assertSame([], $this->trail($x));
    }
}

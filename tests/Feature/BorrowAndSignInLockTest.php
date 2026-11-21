<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * Two rules that compare one table with another are locked at the database
 * (migration 2026_11_19_000009): a loan cannot take more than the item has in
 * stock, and a sign-in / sign-out must fall inside the event's windows.
 */
class BorrowAndSignInLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000009_lock_borrow_stock_and_sign_in_window.php');
    }

    /** Call 08:00, starts 09:00, ends 12:00, call ends 13:00. */
    private function event(array $extra = []): int
    {
        return DB::table('events')->insertGetId(array_merge([
            'name' => 'Fiesta', 'description' => 'x', 'location' => 'Hall',
            'event_start' => '2026-10-10 09:00:00', 'event_end' => '2026-10-10 12:00:00',
            'call_time_start' => '2026-10-10 08:00:00', 'call_time_end' => '2026-10-10 13:00:00',
        ], $extra));
    }

    private function user(): int
    {
        $this->n++;

        return DB::table('users')->insertGetId([
            'user_code' => sprintf('PR-%04d', $this->n), 'first_name' => "N{$this->n}", 'last_name' => "T{$this->n}",
            'contact_number' => '09171234567', 'role' => 'Resident',
        ]);
    }

    /** 5 in stock: 1 new, 3 good, 1 fair. */
    private function item(array $extra = []): int
    {
        $this->n++;

        return DB::table('inventory_items')->insertGetId(array_merge([
            'name' => "Chair {$this->n}", 'quantity' => 5, 'new_quantity' => 1, 'good_quantity' => 3, 'fair_quantity' => 1, 'poor_quantity' => 0,
        ], $extra));
    }

    private function refused(callable $write, string $why): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString($why, $e->getMessage(), 'refused, but not by the expected rule');

            return;
        }
        $this->fail("The database accepted a bad value ({$why})");
    }

    private function loan(int $event, int $item, array $units): int
    {
        return DB::table('event_inventory_items')->insertGetId([
            'event_id' => $event, 'inventory_item_id' => $item,
            'new_quantity' => $units['new'] ?? 0, 'good_quantity' => $units['good'] ?? 0, 'fair_quantity' => $units['fair'] ?? 0, 'poor_quantity' => $units['poor'] ?? 0,
            'quantity' => array_sum($units),
        ]);
    }

    private function attendance(int $event, ?string $in, ?string $out): int
    {
        return DB::table('attendances')->insertGetId([
            'event_id' => $event, 'user_id' => $this->user(), 'time_in' => $in, 'time_out' => $out, 'status' => 'Incomplete',
        ]);
    }

    // ------------------------------------------------------------------ borrowing

    public function test_a_loan_cannot_take_more_than_is_in_stock(): void
    {
        $event = $this->event();
        $item = $this->item();

        $this->refused(fn () => $this->loan($event, $item, ['good' => 6]), 'Cannot borrow more than the item has in stock');
        $this->refused(fn () => $this->loan($event, $item, ['new' => 1, 'good' => 3, 'fair' => 2]), 'Cannot borrow more than the item has in stock');   // 6 in all

        $this->loan($event, $item, ['new' => 1, 'good' => 3, 'fair' => 1]);   // exactly everything: fine
        $this->assertSame(1, DB::table('event_inventory_items')->count());
    }

    public function test_a_loan_cannot_take_more_of_one_condition_than_that_condition_has(): void
    {
        $event = $this->event();
        $item = $this->item();   // only 3 good

        $this->refused(fn () => $this->loan($event, $item, ['good' => 4]), 'Cannot borrow more than the item has in stock');   // 4 is under the 5 in all, but not under 3 good
        $this->refused(fn () => $this->loan($event, $item, ['poor' => 1]), 'Cannot borrow more than the item has in stock');   // none in poor condition

        $this->loan($event, $item, ['good' => 3]);
    }

    public function test_a_loan_that_grows_is_judged_but_lowering_or_removing_it_is_always_allowed(): void
    {
        $event = $this->event();
        $item = $this->item();
        $loan = $this->loan($event, $item, ['good' => 2]);

        $this->refused(fn () => DB::table('event_inventory_items')->where('id', $loan)->update(['good_quantity' => 7, 'quantity' => 7]), 'Cannot borrow more than the item has in stock');

        DB::table('event_inventory_items')->where('id', $loan)->update(['good_quantity' => 3, 'quantity' => 3]);   // grows by 1, 3 good in stock
        DB::table('event_inventory_items')->where('id', $loan)->update(['good_quantity' => 1, 'quantity' => 1]);   // lowering
        DB::table('inventory_items')->where('id', $item)->update(['quantity' => 0, 'new_quantity' => 0, 'good_quantity' => 0, 'fair_quantity' => 0]);   // stock is all gone
        DB::table('event_inventory_items')->where('id', $loan)->update(['good_quantity' => 0, 'quantity' => 0]);   // a return is still fine
        DB::table('event_inventory_items')->where('id', $loan)->delete();
        $this->assertSame(0, DB::table('event_inventory_items')->count());
    }

    public function test_changing_something_else_on_a_loan_is_not_judged(): void
    {
        $event = $this->event();
        $item = $this->item();
        $loan = $this->loan($event, $item, ['good' => 3]);
        DB::table('inventory_items')->where('id', $item)->update(['quantity' => 0, 'new_quantity' => 0, 'good_quantity' => 0, 'fair_quantity' => 0]);   // the units left the shelf

        DB::table('event_inventory_items')->where('id', $loan)->update(['updated_at' => now()]);   // touching it is fine
        $this->assertNotNull(DB::table('event_inventory_items')->where('id', $loan)->value('updated_at'));
    }

    public function test_the_borrow_form_takes_the_units_out_of_stock_and_a_second_borrow_cannot_overdraw_it(): void
    {
        $staff = $this->makeUser('Staff');
        $item = $this->item(['quantity' => 5, 'new_quantity' => 0, 'good_quantity' => 5, 'fair_quantity' => 0]);

        $form = fn (string $name, int $qty) => [
            'name' => $name, 'description' => 'x', 'location' => 'Hall ' . $name,
            'event_start' => now()->addMonth()->toDateTimeString(), 'event_end' => now()->addMonth()->addHours(3)->toDateTimeString(),
            'call_time_start' => now()->addMonth()->subHour()->toDateTimeString(), 'call_time_end' => now()->addMonth()->addHours(4)->toDateTimeString(),
            'borrowed_items' => [['inventory_item_id' => $item, 'quantity' => $qty]],
        ];

        $first = $this->actingAs($staff)->postJson('/events', $form('First', 3));
        $this->assertContains($first->getStatusCode(), [200, 201], $first->getContent());
        $this->assertSame(2, (int) DB::table('inventory_items')->where('id', $item)->value('quantity'));
        $this->assertSame(3, (int) DB::table('event_inventory_items')->where('inventory_item_id', $item)->value('quantity'));

        $second = $this->actingAs($staff)->postJson('/events', $form('Second', 3));
        $this->assertGreaterThanOrEqual(400, $second->getStatusCode());
        $this->assertSame(2, (int) DB::table('inventory_items')->where('id', $item)->value('quantity'));   // untouched
        $this->assertSame(1, DB::table('event_inventory_items')->where('inventory_item_id', $item)->count());

        // and straight at the database, past the app: 3 more units cannot come out of the 2 left
        $this->refused(fn () => $this->loan(DB::table('events')->value('id'), $item, ['good' => 3]), 'Cannot borrow more than the item has in stock');
        $this->assertSame(2, InventoryItem::find($item)->quantity);
    }

    // ------------------------------------------------------------------ sign-in window

    public function test_a_sign_in_must_fall_between_call_time_start_and_event_start(): void
    {
        $event = $this->event();

        $this->refused(fn () => $this->attendance($event, '2026-10-10 07:59:59', null), 'Sign-in is outside the sign-in window');   // before the call time
        $this->refused(fn () => $this->attendance($event, '2026-10-10 09:00:01', null), 'Sign-in is outside the sign-in window');   // after the event started
        $this->refused(fn () => $this->attendance($event, '2026-10-11 08:30:00', null), 'Sign-in is outside the sign-in window');

        $this->attendance($event, '2026-10-10 08:00:00', null);   // the moment it opens
        $this->attendance($event, '2026-10-10 08:30:00', null);
        $this->attendance($event, '2026-10-10 09:00:00', null);   // the moment the event starts
        $this->attendance($event, null, null);                    // a placeholder row, nobody scanned yet
        $this->assertSame(4, DB::table('attendances')->count());
    }

    public function test_an_event_without_a_call_time_lets_people_sign_in_any_time_up_to_its_start(): void
    {
        $event = $this->event(['call_time_start' => null, 'call_time_end' => null]);

        $this->attendance($event, '2026-10-01 06:00:00', null);
        $this->attendance($event, '2026-10-10 09:00:00', null);
        $this->refused(fn () => $this->attendance($event, '2026-10-10 09:00:01', null), 'Sign-in is outside the sign-in window');
    }

    public function test_changing_a_sign_in_time_is_judged_but_other_edits_are_not(): void
    {
        $event = $this->event();
        $a = $this->attendance($event, null, null);   // a sign-in time is written once, from empty, as the scan does

        $this->refused(fn () => DB::table('attendances')->where('id', $a)->update(['time_in' => '2026-10-10 10:00:00']), 'Sign-in is outside the sign-in window');
        DB::table('attendances')->where('id', $a)->update(['time_in' => '2026-10-10 08:45:00']);
        DB::table('attendances')->where('id', $a)->update(['status' => 'Complete']);   // not a time change
        $this->assertSame('Complete', DB::table('attendances')->where('id', $a)->value('status'));
    }

    // ------------------------------------------------------------------ sign-out window

    public function test_a_sign_out_must_fall_between_event_end_and_call_time_end(): void
    {
        $event = $this->event();

        $this->refused(fn () => $this->attendance($event, null, '2026-10-10 11:59:59'), 'Sign-out is outside the sign-out window');   // the event is still running
        $this->refused(fn () => $this->attendance($event, null, '2026-10-10 13:00:01'), 'Sign-out is outside the sign-out window');   // call time already closed

        $this->attendance($event, '2026-10-10 08:30:00', '2026-10-10 12:00:00');   // the moment the event ends
        $this->attendance($event, null, '2026-10-10 12:30:00');
        $this->attendance($event, null, '2026-10-10 13:00:00');                    // the moment the call time closes
        $this->assertSame(3, DB::table('attendances')->count());
    }

    public function test_sign_out_has_no_upper_limit_without_a_call_time_end_and_no_limit_at_all_without_an_event_end(): void
    {
        $openEnded = $this->event(['call_time_end' => null]);
        $this->attendance($openEnded, null, '2026-10-10 12:00:00');
        $this->attendance($openEnded, null, '2026-10-31 23:00:00');
        $this->refused(fn () => $this->attendance($openEnded, null, '2026-10-10 11:00:00'), 'Sign-out is outside the sign-out window');

        $noEnd = $this->event(['event_end' => null, 'call_time_end' => null]);
        $this->attendance($noEnd, null, '2026-10-10 06:00:00');   // no event end, so no sign-out window to judge
    }

    public function test_changing_a_sign_out_time_is_judged(): void
    {
        $event = $this->event();
        $a = $this->attendance($event, '2026-10-10 08:30:00', null);   // a sign-out time is written once, from empty

        $this->refused(fn () => DB::table('attendances')->where('id', $a)->update(['time_out' => '2026-10-10 11:00:00']), 'Sign-out is outside the sign-out window');
        DB::table('attendances')->where('id', $a)->update(['time_out' => '2026-10-10 12:45:00']);
    }

    // ------------------------------------------------------------------ older records and the migration itself

    public function test_records_saved_before_the_lock_stay_editable_and_the_migration_never_fails_on_them(): void
    {
        $m = $this->migration();
        $m->down();
        $event = $this->event();
        $old = $this->attendance($event, '2026-10-10 10:00:00', '2026-10-10 10:30:00');   // outside both windows, saved before the lock
        $item = $this->item(['quantity' => 1, 'new_quantity' => 0, 'good_quantity' => 1, 'fair_quantity' => 0]);
        $oldLoan = $this->loan($event, $item, ['good' => 4]);                              // more than the stock
        $m->up();                                                                          // runs fine over them

        DB::table('attendances')->where('id', $old)->update(['status' => 'Complete']);               // unrelated edit still works
        DB::table('event_inventory_items')->where('id', $oldLoan)->update(['updated_at' => now()]);   // so does this one
        $this->assertSame('Complete', DB::table('attendances')->where('id', $old)->value('status'));

        $this->refused(fn () => DB::table('attendances')->where('id', $old)->update(['time_in' => '2026-10-10 10:05:00']), 'Sign-in is outside the sign-in window');
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->up();   // twice in a row is safe
        $m->down();

        $event = $this->event();
        $this->attendance($event, '2026-10-10 10:00:00', null);   // allowed while unlocked
        DB::table('attendances')->delete();
        $m->up();

        $this->refused(fn () => $this->attendance($event, '2026-10-10 10:00:00', null), 'Sign-in is outside the sign-in window');
    }
}

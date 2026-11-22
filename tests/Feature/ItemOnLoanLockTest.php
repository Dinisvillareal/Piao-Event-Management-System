<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * An item that is out on loan cannot be archived or permanently deleted
 * (migration 2026_11_19_000012), whatever route tries it.
 */
class ItemOnLoanLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000012_lock_items_on_loan_against_archive_and_delete.php');
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

    private function event(): int
    {
        return DB::table('events')->insertGetId([
            'name' => 'Fiesta ' . ++$this->n, 'description' => 'x', 'location' => 'Hall ' . $this->n,
            'event_start' => now()->subDays(2)->toDateTimeString(), 'event_end' => now()->subDay()->toDateTimeString(),
        ]);
    }

    private function item(int $stock = 10): int
    {
        return DB::table('inventory_items')->insertGetId(['name' => 'Chairs ' . ++$this->n, 'quantity' => $stock, 'good_quantity' => $stock]);
    }

    private function archive(int $item, ?string $by = 'PR-0001'): void
    {
        DB::table('inventory_items')->where('id', $item)->update(['deleted_at' => now(), 'deleted_by' => $by]);
    }

    public function test_an_item_on_loan_cannot_be_archived(): void
    {
        $event = $this->event();
        $item = $this->item();
        $this->loanRow($event, $item, 3);

        $this->refused(fn () => $this->archive($item), 'An item that is on loan cannot be archived');
        $this->assertNull(DB::table('inventory_items')->where('id', $item)->value('deleted_at'));
    }

    public function test_an_item_with_no_loan_can_be_archived_and_restored(): void
    {
        $item = $this->item();
        $this->archive($item);
        $this->assertNotNull(DB::table('inventory_items')->where('id', $item)->value('deleted_at'));

        DB::table('inventory_items')->where('id', $item)->update(['deleted_at' => null]);   // restoring is always fine
        $this->assertNull(DB::table('inventory_items')->where('id', $item)->value('deleted_at'));
    }

    public function test_an_item_can_be_archived_once_its_loan_is_closed(): void
    {
        $event = $this->event();
        $item = $this->item();
        $this->loanRow($event, $item, 2);
        $this->refused(fn () => $this->archive($item), 'An item that is on loan cannot be archived');

        DB::table('event_inventory_items')->where('inventory_item_id', $item)->delete();
        $this->archive($item);
        $this->assertNotNull(DB::table('inventory_items')->where('id', $item)->value('deleted_at'));
    }

    public function test_another_items_loan_does_not_matter(): void
    {
        $event = $this->event();
        $this->loanRow($event, $this->item(), 2);
        $free = $this->item();

        $this->archive($free);
        $this->assertNotNull(DB::table('inventory_items')->where('id', $free)->value('deleted_at'));
    }

    public function test_the_archive_button_still_answers_with_a_message_and_the_item_stays(): void
    {
        $staff = $this->staff();
        $event = $this->event();
        $item = $this->item();
        $this->loanRow($event, $item, 2);

        $this->actingAs($staff)->deleteJson("/inventory/{$item}")->assertStatus(409);   // the app says no first, in its own words
        $this->assertNull(DB::table('inventory_items')->where('id', $item)->value('deleted_at'));

        DB::table('event_inventory_items')->delete();
        $this->actingAs($staff)->deleteJson("/inventory/{$item}")->assertOk();
        $this->assertNotNull(DB::table('inventory_items')->where('id', $item)->value('deleted_at'));
    }

    public function test_an_item_on_loan_or_with_a_return_history_cannot_be_permanently_deleted(): void
    {
        $event = $this->event();
        $onLoan = $this->item();
        $this->loanRow($event, $onLoan, 2);
        $returned = $this->item();
        DB::table('event_inventory_releases')->insert(['event_id' => $event, 'inventory_item_id' => $returned, 'quantity' => 0]);
        $plain = $this->item();

        $this->refused(fn () => DB::table('inventory_items')->where('id', $onLoan)->delete(), 'cannot be deleted');
        $this->refused(fn () => DB::table('inventory_items')->where('id', $returned)->delete(), 'cannot be deleted');
        $this->assertSame(1, DB::table('event_inventory_items')->count());     // the loan was not cascaded away
        $this->assertSame(1, DB::table('event_inventory_releases')->count());  // neither was the history

        DB::table('inventory_items')->where('id', $plain)->delete();           // an unused item is fine
        $this->assertSame(0, DB::table('inventory_items')->where('id', $plain)->count());
    }

    public function test_an_old_archived_item_still_on_loan_can_be_restored_and_edited(): void
    {
        $m = $this->migration();
        $m->down();
        $event = $this->event();
        $item = $this->item();
        $this->loanRow($event, $item, 2);
        $this->archive($item);                         // archived while on loan, before the rule
        $m->up();                                      // the migration runs fine over it

        DB::table('inventory_items')->where('id', $item)->update(['notes' => 'edited']);         // an unrelated edit is not blocked
        DB::table('inventory_items')->where('id', $item)->update(['deleted_at' => null]);        // restoring is fine
        $this->assertNull(DB::table('inventory_items')->where('id', $item)->value('deleted_at'));
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->up();   // twice in a row is safe
        $m->down();

        $event = $this->event();
        $item = $this->item();
        $this->loanRow($event, $item, 2);
        $this->archive($item);                         // allowed while unlocked
        DB::table('inventory_items')->where('id', $item)->update(['deleted_at' => null, 'deleted_by' => null]);
        $m->up();

        $this->refused(fn () => $this->archive($item), 'An item that is on loan cannot be archived');
    }
}

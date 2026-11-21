<?php

namespace Tests\Feature;

use App\Models\AgeBracket;
use App\Models\CivilStatus;
use App\Models\CurrentStatus;
use App\Models\Event;
use App\Models\Household;
use App\Models\InventoryItem;
use App\Models\Membership;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * Three rules locked at the database (migration 2026_11_19_000011): a return cannot be bigger
 * than the loan, units reported lost cannot be more than the loan holds, and a record cannot
 * be archived without saying who archived it.
 */
class ReturnLostAndArchiveLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000011_lock_returns_lost_units_and_archived_by.php');
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
            'name' => 'Clean-Up Drive ' . ++$this->n, 'description' => 'x', 'location' => 'Hall ' . $this->n,
            'event_start' => now()->subDays(2)->toDateTimeString(), 'event_end' => now()->subDay()->toDateTimeString(),
        ]);
    }

    private function item(int $stock = 20): int
    {
        return DB::table('inventory_items')->insertGetId([
            'name' => 'Chairs ' . ++$this->n, 'quantity' => $stock, 'good_quantity' => $stock,
        ]);
    }

    private function release(int $event, int $item, int $qty): int
    {
        return DB::table('event_inventory_releases')->insertGetId([
            'event_id' => $event, 'inventory_item_id' => $item, 'quantity' => $qty, 'good_quantity' => $qty,
        ]);
    }

    private function lostLog(?int $event, int $item, int $qty, string $action = 'lost'): int
    {
        return DB::table('inventory_unit_logs')->insertGetId([
            'inventory_item_id' => $item, 'event_id' => $event, 'action' => $action, 'quantity' => $qty,
        ]);
    }

    // ------------------------------------------------------------------ returns

    public function test_a_return_cannot_be_bigger_than_what_the_event_still_has_on_loan(): void
    {
        $event = $this->event();
        $item = $this->item();
        $this->loanRow($event, $item, 4);   // 10 chairs borrowed, 6 already back: 4 still out

        $this->refused(fn () => $this->release($event, $item, 8), 'Cannot return more than the event still has on loan');
        $this->refused(fn () => $this->release($event, $item, 5), 'Cannot return more than the event still has on loan');

        $this->release($event, $item, 4);   // exactly what is out
        $this->release($event, $item, 1);
        $this->assertSame(2, DB::table('event_inventory_releases')->count());
    }

    public function test_a_return_with_no_loan_at_all_is_refused(): void
    {
        $event = $this->event();
        $item = $this->item();
        $otherItem = $this->item();
        $this->loanRow($event, $otherItem, 5);   // a loan of a different item does not count

        $this->refused(fn () => $this->release($event, $item, 1), 'Cannot return more than the event still has on loan');
        $this->refused(fn () => $this->release($this->event(), $otherItem, 1), 'Cannot return more than the event still has on loan');
    }

    public function test_a_return_is_only_judged_when_it_is_added(): void
    {
        $event = $this->event();
        $item = $this->item();
        $this->loanRow($event, $item, 3);
        $id = $this->release($event, $item, 3);

        DB::table('event_inventory_items')->where('event_id', $event)->delete();      // the loan is closed once everything is back
        DB::table('event_inventory_releases')->where('id', $id)->update(['released_by' => 'PR-0001']);   // a later edit of the record is fine
        DB::table('event_inventory_releases')->where('id', $id)->update(['undone_at' => now()]);          // so is undoing it
        $this->assertNotNull(DB::table('event_inventory_releases')->where('id', $id)->value('undone_at'));
    }

    public function test_returning_through_the_app_still_works_whole_partly_and_for_every_item_at_once(): void
    {
        $event = Event::create(['name' => 'Fiesta', 'description' => 'x', 'location' => 'Hall', 'event_start' => now()->subDays(2), 'event_end' => now()->subDay()]);
        $item = InventoryItem::create(['name' => 'Tents', 'quantity' => 10, 'new_quantity' => 0, 'good_quantity' => 10, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $loanId = $this->loanRow($event->id, $item->id, 6);
        $staff = $this->staff();

        $post = fn (array $d) => $this->actingAs($staff)->post("/events/{$event->id}/borrowed-items/{$loanId}/release", $d + ['photos' => [$this->fakeImage('p.jpg')]], ['Accept' => 'application/json']);

        $post(['quantity' => 2])->assertOk();                                                    // partly
        $this->assertSame(4, (int) DB::table('event_inventory_items')->where('id', $loanId)->value('quantity'));
        $this->assertSame(12, (int) $item->fresh()->quantity);

        $post(['quantity' => 5])->assertStatus(422);                                              // more than is out: refused by the app first
        $this->assertSame(4, (int) DB::table('event_inventory_items')->where('id', $loanId)->value('quantity'));

        $post([])->assertOk();                                                                    // the rest
        $this->assertSame(0, DB::table('event_inventory_items')->count());
        $this->assertSame(16, (int) $item->fresh()->quantity);
        $this->assertSame([2, 4], DB::table('event_inventory_releases')->orderBy('id')->pluck('quantity')->map(fn ($q) => (int) $q)->all());
    }

    // ------------------------------------------------------------------ lost units

    public function test_units_reported_lost_cannot_be_more_than_the_loan_holds(): void
    {
        $event = $this->event();
        $item = $this->item();
        $this->loanRow($event, $item, 5);   // 5 tents borrowed

        $this->refused(fn () => $this->lostLog($event, $item, 20), 'Cannot report more units lost than the event still has on loan');
        $this->refused(fn () => $this->lostLog($event, $item, 6), 'Cannot report more units lost than the event still has on loan');

        $this->lostLog($event, $item, 2);   // the real case: 2 lost
        $this->lostLog($event, $item, 5);   // everything on loan
        $this->assertSame(2, DB::table('inventory_unit_logs')->where('action', 'lost')->count());
    }

    public function test_only_lost_reports_tied_to_an_event_are_judged(): void
    {
        $event = $this->event();
        $item = $this->item();

        $this->lostLog(null, $item, 50);                    // an item-level entry, no event: not a loan
        $this->lostLog($event, $item, 50, 'found');          // another kind of entry
        $this->lostLog($event, $item, 50, 'adjusted');
        $this->refused(fn () => $this->lostLog($event, $item, 1), 'Cannot report more units lost than the event still has on loan');
    }

    public function test_reporting_lost_units_through_the_app_still_works_and_cannot_overreport(): void
    {
        $event = Event::create(['name' => 'Covered Court', 'description' => 'x', 'location' => 'Court', 'event_start' => now()->subDays(2), 'event_end' => now()->subDay()]);
        $item = InventoryItem::create(['name' => 'Tents', 'quantity' => 0, 'new_quantity' => 0, 'good_quantity' => 0, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $loanId = $this->loanRow($event->id, $item->id, 5);
        $staff = $this->staff();
        $url = "/events/{$event->id}/borrowed-items/{$loanId}/lost";

        $this->actingAs($staff)->postJson($url, ['lost_units' => ['Good' => 20]])->assertStatus(422);   // the app says no first
        $this->assertSame(0, (int) $item->fresh()->lost_quantity);

        $this->actingAs($staff)->postJson($url, ['lost_units' => ['Good' => 2]])->assertOk();
        $this->assertSame(2, (int) $item->fresh()->lost_quantity);
        $this->assertSame(3, (int) DB::table('event_inventory_items')->where('id', $loanId)->value('quantity'));
        $this->assertSame(1, DB::table('inventory_unit_logs')->where('action', 'lost')->where('quantity', 2)->count());

        $this->actingAs($staff)->postJson($url, ['lost_units' => ['Good' => 3]])->assertOk();   // the rest of the loan
        $this->assertSame(0, DB::table('event_inventory_items')->count());
        $this->assertSame(5, (int) $item->fresh()->lost_quantity);
    }

    // ------------------------------------------------------------------ archived by

    /** One live row of every table that can be archived. */
    private function liveRows(): array
    {
        $this->n++;
        $event = Event::create(['name' => "Ev{$this->n}", 'description' => 'x', 'location' => "L{$this->n}", 'event_start' => now()->addDay(), 'event_end' => now()->addDays(2)]);

        return [
            $event,
            $event->expenses()->create(['item' => 'Food', 'amount' => 100, 'receipt_path' => 'expense_receipts/1731900000_r.jpg']),
            AgeBracket::create(['label' => "Age{$this->n}", 'min_age' => 1, 'max_age' => 9, 'sort_order' => 90]),
            CivilStatus::create(['label' => "Civil{$this->n}", 'sort_order' => 90]),
            Household::create(['code' => sprintf('HH-%04d', $this->n)]),
            CurrentStatus::create(['label' => "Status{$this->n}", 'category' => 'other', 'sort_order' => 90]),
            $this->makeUser('Resident'),
            InventoryItem::create(['name' => "Item{$this->n}", 'quantity' => 1, 'new_quantity' => 0, 'good_quantity' => 1, 'fair_quantity' => 0, 'poor_quantity' => 0]),
            Membership::create(['name' => "Club{$this->n}", 'description' => 'x']),
        ];
    }

    public function test_a_record_cannot_be_archived_without_saying_who_archived_it(): void
    {
        foreach ($this->liveRows() as $row) {
            $table = $row->getTable();

            $this->refused(fn () => DB::table($table)->where('id', $row->id)->update(['deleted_at' => now()]), 'An archived record must say who archived it');
            $this->refused(fn () => DB::table($table)->where('id', $row->id)->update(['deleted_at' => now(), 'deleted_by' => null]), 'An archived record must say who archived it');
            $this->assertNull(DB::table($table)->where('id', $row->id)->value('deleted_at'), "{$table} was archived anyway");

            DB::table($table)->where('id', $row->id)->update(['deleted_at' => now(), 'deleted_by' => 'PR-0001']);   // both together: fine
            $this->assertNotNull(DB::table($table)->where('id', $row->id)->value('deleted_at'));
        }
    }

    public function test_the_two_step_archive_the_app_uses_still_works_and_restore_leaves_nothing_behind(): void
    {
        foreach ($this->liveRows() as $row) {
            $row->forceFill(['deleted_by' => 'PR-0001'])->save();   // first the name...
            $row->delete();                                          // ...then the archive
            $this->assertNotNull($row->fresh() ?? $row->newQuery()->withTrashed()->find($row->id)->deleted_at);

            $row->deleted_by = null;                                 // restore: the name is cleared while still archived
            $row->save();
            $row->restore();
            $this->assertNull($row->newQuery()->withTrashed()->find($row->id)->deleted_at);
        }
    }

    public function test_a_row_cannot_be_added_already_archived_without_a_name(): void
    {
        $this->refused(fn () => DB::table('memberships')->insert(['name' => 'Gone', 'description' => 'x', 'deleted_at' => now()]), 'An archived record must say who archived it');
        DB::table('memberships')->insert(['name' => 'Gone', 'description' => 'x', 'deleted_at' => now(), 'deleted_by' => 'PR-0001']);
        $this->assertSame(1, DB::table('memberships')->count());
    }

    public function test_an_old_archived_row_without_a_name_can_still_be_restored_and_edited(): void
    {
        $m = $this->migration();
        $m->down();
        $id = DB::table('memberships')->insertGetId(['name' => 'Old', 'description' => 'x', 'deleted_at' => now()]);   // archived before deleted_by existed
        $m->up();                                                                                                          // the migration runs fine over it

        DB::table('memberships')->where('id', $id)->update(['description' => 'edited']);                                   // an unrelated edit is not blocked
        DB::table('memberships')->where('id', $id)->update(['deleted_at' => null]);                                        // restoring it is fine
        $this->assertNull(DB::table('memberships')->where('id', $id)->value('deleted_at'));
    }

    // ------------------------------------------------------------------ the migration itself

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->up();   // twice in a row is safe
        $m->down();

        $event = $this->event();
        $item = $this->item();
        $this->release($event, $item, 9);                                       // allowed while unlocked
        $this->lostLog($event, $item, 9);
        DB::table('memberships')->insert(['name' => 'Gone', 'description' => 'x', 'deleted_at' => now()]);
        DB::table('event_inventory_releases')->delete();
        $this->withoutTimeLocks(fn () => DB::table('inventory_unit_logs')->delete());   // the ledger cannot be emptied while it is locked
        DB::table('memberships')->delete();
        $m->up();

        $this->refused(fn () => $this->release($event, $item, 9), 'Cannot return more than the event still has on loan');
        $this->refused(fn () => $this->lostLog($event, $item, 9), 'Cannot report more units lost than the event still has on loan');
        $this->refused(fn () => DB::table('memberships')->insert(['name' => 'Gone', 'description' => 'x', 'deleted_at' => now()]), 'An archived record must say who archived it');
    }
}

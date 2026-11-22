<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\InventoryItem;
use App\Models\InventoryUnitLog;
use App\Support\AuditChain;
use App\Support\StockLedger;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * The inventory unit log is a ledger (migration 2026_11_19_000021): an entry is never edited or deleted, only
 * its undo marker may be set once; every entry is on a hash chain; and stock reconciles with the ledger.
 */
class InventoryLedgerTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
        @unlink(AuditChain::anchorPath('inventory_unit_logs'));
    }

    protected function tearDown(): void
    {
        @unlink(AuditChain::anchorPath('inventory_unit_logs'));
        parent::tearDown();
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000021_lock_inventory_ledger_and_hash_chain.php');
    }

    private function refused(callable $write, string $why): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString($why, $e->getMessage(), 'refused, but not by the expected rule');

            return;
        }
        $this->fail("The database accepted the change ({$why})");
    }

    private function item(int $good = 20): InventoryItem
    {
        return InventoryItem::create(['name' => 'Chairs ' . uniqid(), 'quantity' => $good, 'new_quantity' => 0, 'good_quantity' => $good, 'fair_quantity' => 0, 'poor_quantity' => 0]);
    }

    private function entry(InventoryItem $item, string $action = 'found', int $qty = 2, array $extra = []): InventoryUnitLog
    {
        return InventoryUnitLog::create(array_merge([
            'inventory_item_id' => $item->id, 'event_id' => null, 'action' => $action, 'quantity' => $qty,
            'units' => ['Good' => $qty], 'user_code' => 'PR-0001',
        ], $extra))->fresh();
    }

    private function verify(): array
    {
        return [Artisan::call('log:verify'), Artisan::output()];
    }

    // ---------- core columns are written once ----------

    public function test_a_saved_entry_cannot_be_changed_or_deleted(): void
    {
        $item = $this->item();
        $e = $this->entry($item);
        $row = fn () => DB::table('inventory_unit_logs')->where('id', $e->id);

        foreach ([['quantity' => 99], ['units' => json_encode(['Good' => 99])], ['action' => 'lost'], ['inventory_item_id' => 999], ['user_code' => 'PR-0002'],
                  ['photo_path' => 'inventory_unit_photos/1731900000_x.png'], ['event_id' => 5], ['created_at' => now()->subDay()->toDateTimeString()]] as $change) {
            $this->refused(fn () => $row()->update($change), 'cannot be changed');
        }
        $this->refused(fn () => $row()->delete(), 'A ledger entry cannot be deleted');
        $this->refused(fn () => DB::table('inventory_unit_logs')->delete(), 'A ledger entry cannot be deleted');
        $this->refused(fn () => $e->update(['quantity' => 5]), 'cannot be changed');

        $this->assertSame(2, (int) $row()->value('quantity'));
        $this->entry($item, 'lost', 1);   // adding is what the ledger is for
    }

    public function test_saving_the_same_values_again_is_not_a_change(): void
    {
        $e = $this->entry($this->item());

        DB::table('inventory_unit_logs')->where('id', $e->id)->update(['quantity' => 2, 'user_code' => 'PR-0001', 'updated_at' => now()->toDateTimeString()]);
        $this->assertSame(2, (int) DB::table('inventory_unit_logs')->where('id', $e->id)->value('quantity'));
    }

    // ---------- the undo marker ----------

    public function test_a_found_entry_can_be_undone_once_with_the_time_and_who_undid_it(): void
    {
        $e = $this->entry($this->item());
        $row = fn () => DB::table('inventory_unit_logs')->where('id', $e->id);

        $this->refused(fn () => $row()->update(['undone_at' => now()->toDateTimeString()]), 'An undo needs both the time and who undid it');
        $this->refused(fn () => $row()->update(['undone_by' => 'PR-0001']), 'An undo needs both the time and who undid it');

        $row()->update(['undone_at' => now()->toDateTimeString(), 'undone_by' => 'PR-0001']);

        $this->refused(fn () => $row()->update(['undone_at' => now()->addSeconds(30)->toDateTimeString()]), 'cannot be changed');   // re-dating
        $this->refused(fn () => $row()->update(['undone_at' => null, 'undone_by' => null]), 'cannot be changed');
        $this->refused(fn () => $row()->update(['undone_by' => 'PR-0002']), 'Who undid an entry cannot be changed');
        $this->refused(fn () => $row()->update(['quantity' => 1]), 'cannot be changed');
    }

    public function test_only_a_found_entry_can_be_undone(): void
    {
        $item = $this->item();
        foreach (['added', 'adjusted', 'lost'] as $action) {
            $e = $this->entry($item, $action, 1);
            $this->refused(fn () => DB::table('inventory_unit_logs')->where('id', $e->id)->update(['undone_at' => now()->toDateTimeString(), 'undone_by' => 'PR-0001']), 'Only a found report can be undone');
        }
    }

    // ---------- the app still works, and stock reconciles with the ledger ----------

    public function test_every_inventory_screen_keeps_working_and_stock_reconciles_throughout(): void
    {
        $staff = $this->staff();
        $reconciled = fn () => $this->assertSame([], StockLedger::check());

        // add an item: the opening stock is written into the ledger
        $res = $this->actingAs($staff)->post('/inventory', ['name' => 'Tents', 'quantity' => 0, 'new_quantity' => 0, 'good_quantity' => 20, 'fair_quantity' => 0, 'poor_quantity' => 0,
            'photo' => $this->fakeImage('t.jpg')], ['Accept' => 'application/json'])->assertStatus(201);
        $id = (int) $res->json('item.id');
        $reconciled();
        $this->assertSame('added', InventoryUnitLog::where('inventory_item_id', $id)->value('action'));

        // adjust the stock upwards
        $this->actingAs($staff)->putJson("/inventory/{$id}", ['name' => 'Tents', 'quantity' => 0, 'new_quantity' => 0, 'good_quantity' => 25, 'fair_quantity' => 0, 'poor_quantity' => 0])->assertOk();
        $this->assertSame('adjusted', InventoryUnitLog::where('inventory_item_id', $id)->where('action', 'adjusted')->value('action'));
        $reconciled();

        // lend 6 to an event, lose 2 of them
        $event = Event::create(['name' => 'Clean-up', 'description' => 'x', 'location' => 'Court', 'event_start' => now()->subDays(2), 'event_end' => now()->subDay()]);
        $loan = $this->loanRow($event->id, $id, 6);
        DB::table('inventory_items')->where('id', $id)->update(['quantity' => 19, 'good_quantity' => 19]);   // the 6 left the shelf, as a real borrow does
        $reconciled();
        $this->actingAs($staff)->postJson("/events/{$event->id}/borrowed-items/{$loan}/lost", ['lost_units' => ['Good' => 2]])->assertOk();
        $reconciled();

        // one of the lost is found, then that report is corrected, then undone
        $this->actingAs($staff)->post("/inventory/{$id}/units", ['action' => 'found', 'units' => ['Good' => 1], 'photos' => [$this->fakeImage('p.jpg')]], ['Accept' => 'application/json'])->assertSuccessful();
        $reconciled();
        $found = InventoryUnitLog::where('inventory_item_id', $id)->where('action', 'found')->first();
        $this->actingAs($staff)->post("/inventory/{$id}/unit-logs/{$found->id}/edit", ['units' => ['Good' => 2], 'photos_sync' => 0], ['Accept' => 'application/json'])->assertSuccessful();
        $reconciled();
        $latest = InventoryUnitLog::where('inventory_item_id', $id)->where('action', 'found')->whereNull('undone_at')->first();
        $this->actingAs($staff)->postJson("/inventory/{$id}/unit-logs/{$latest->id}/undo")->assertOk();
        $reconciled();

        $this->assertSame(0, $this->verify()[0], $this->verify()[1]);
        $this->assertNotNull(InventoryUnitLog::find($found->id)->undone_at);   // the corrected entry was kept, marked undone
    }

    // ---------- reconcile ----------

    public function test_a_stock_number_changed_outside_the_app_is_reported(): void
    {
        $staff = $this->staff();
        $this->actingAs($staff)->post('/inventory', ['name' => 'Tables', 'quantity' => 0, 'new_quantity' => 0, 'good_quantity' => 10, 'fair_quantity' => 0, 'poor_quantity' => 0,
            'photo' => $this->fakeImage('t.jpg')], ['Accept' => 'application/json'])->assertStatus(201);
        $id = (int) InventoryItem::value('id');

        DB::table('inventory_items')->where('id', $id)->update(['quantity' => 60, 'good_quantity' => 60]);   // stock quietly raised by hand

        $problems = StockLedger::check();
        $this->assertCount(1, $problems);
        $this->assertSame(50, $problems[0]['owned_gap']);
        $this->assertSame(1, Artisan::call('stock:reconcile'));
        $this->assertStringContainsString('Tables', Artisan::output());
    }

    public function test_lost_units_changed_outside_the_app_are_reported(): void
    {
        $item = $this->item(10);
        $this->entry($item, 'added', 10);
        DB::table('inventory_items')->where('id', $item->id)->update(['lost_quantity' => 4, 'quantity' => 6, 'good_quantity' => 6]);   // 4 "lost" with no report

        $p = StockLedger::check()[0];
        $this->assertSame(4, $p['lost_gap']);
        $this->assertSame(0, $p['owned_gap']);
    }

    public function test_items_from_before_the_ledger_are_adopted_as_explicit_opening_entries(): void
    {
        $a = $this->item(30);                                                                   // no ledger at all
        $b = $this->item(8);
        DB::table('inventory_items')->where('id', $b->id)->update(['lost_quantity' => 2]);      // and 2 lost, never reported

        $this->assertCount(2, StockLedger::check());
        $this->assertSame(0, Artisan::call('stock:reconcile', ['--adopt' => true, '--force' => true]));

        $this->assertSame([], StockLedger::check());
        $this->assertSame(30, (int) InventoryUnitLog::where('inventory_item_id', $a->id)->where('action', 'added')->value('quantity'));
        $this->assertSame(['SYSTEM'], InventoryUnitLog::pluck('user_code')->unique()->values()->all());   // visibly written by the system
        $this->assertSame(0, StockLedger::adopt());                                                      // nothing left to adopt
        $this->assertSame(0, $this->verify()[0]);
    }

    public function test_the_seeded_demo_inventory_reconciles(): void
    {
        $this->seed();

        $this->assertSame([], StockLedger::check());
        $this->assertGreaterThan(20, InventoryUnitLog::count());
        $this->assertSame(0, $this->verify()[0]);
    }

    // ---------- the hash chain ----------

    public function test_entries_join_the_chain_and_tampering_is_named(): void
    {
        $item = $this->item();
        $this->entry($item, 'added', 20);
        $b = $this->entry($item, 'lost', 1);
        $c = $this->entry($item, 'found', 1);

        $this->assertSame($b->row_hash, $c->prev_hash);
        $this->assertSame(0, $this->verify()[0]);

        $this->withoutTimeLocks(fn () => DB::table('inventory_unit_logs')->where('id', $b->id)->update(['quantity' => 5]));
        [$code, $out] = $this->verify();
        $this->assertSame(1, $code);
        $this->assertStringContainsString("Row #{$b->id} was edited", $out);
        $this->assertStringContainsString('TAMPERING DETECTED in the inventory ledger', $out);
    }

    public function test_undoing_an_entry_does_not_break_its_fingerprint(): void
    {
        $e = $this->entry($this->item());
        DB::table('inventory_unit_logs')->where('id', $e->id)->update(['undone_at' => now()->toDateTimeString(), 'undone_by' => 'PR-0001']);

        $this->assertSame(0, $this->verify()[0]);
    }

    public function test_a_removed_or_planted_entry_is_noticed(): void
    {
        $item = $this->item();
        $this->entry($item, 'added', 20);
        $b = $this->entry($item, 'lost', 1);
        $c = $this->entry($item, 'found', 1);

        $this->withoutTimeLocks(fn () => DB::table('inventory_unit_logs')->where('id', $b->id)->delete());
        $this->assertStringContainsString("Row #{$c->id} does not follow the row before it", $this->verify()[1]);

        DB::table('inventory_unit_logs')->insert(['inventory_item_id' => $item->id, 'action' => 'found', 'quantity' => 9, 'units' => json_encode(['Good' => 9]), 'created_at' => now()->subHour()->toDateTimeString(), 'updated_at' => now()->subHour()->toDateTimeString()]);
        $planted = (int) DB::table('inventory_unit_logs')->max('id');
        $this->assertStringContainsString("Row #{$planted} has no fingerprint", $this->verify()[1]);
    }

    public function test_the_fingerprints_never_appear_in_the_api(): void
    {
        $staff = $this->staff();
        $item = $this->item();
        $this->entry($item, 'added', 20);

        $json = $this->actingAs($staff)->getJson("/inventory/{$item->id}/unit-logs")->assertOk()->getContent();
        $this->assertStringNotContainsString('row_hash', $json);
        $this->assertStringNotContainsString('prev_hash', $json);
    }

    // ---------- the migration ----------

    public function test_the_migration_can_be_rolled_back_and_run_again_and_never_fails_on_stored_rows(): void
    {
        $m = $this->migration();
        $item = $this->item();
        $e = $this->entry($item);

        $m->down();   // back to a ledger with no chain columns and no lock
        DB::table('inventory_unit_logs')->where('id', $e->id)->update(['quantity' => 7]);
        $m->up();
        $m->up();

        $this->assertSame(7, (int) DB::table('inventory_unit_logs')->where('id', $e->id)->value('quantity'));   // stored rows are never scanned
        $this->assertNull(DB::table('inventory_unit_logs')->where('id', $e->id)->value('row_hash'));
        $this->refused(fn () => DB::table('inventory_unit_logs')->where('id', $e->id)->update(['quantity' => 8]), 'cannot be changed');
    }
}

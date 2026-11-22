<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Event;
use App\Models\EventInventoryItem;
use App\Models\EventInventoryRelease;
use App\Models\InventoryItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * Returning borrowed items must be all-or-nothing and must leave the stock exact:
 * the stock, the loan, the return record and its evidence photo all change together,
 * or none of them do.
 */
class ReturnFlowTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
    }

    private function event(string $name = 'Fiesta'): Event
    {
        return Event::create([
            'name' => $name, 'description' => 'Test', 'location' => 'Barangay Hall',
            'event_start' => now()->subDays(2), 'event_end' => now()->subDay(),
        ]);
    }

    /** An item with $inStock units already in stock (all Good); the loan is separate. */
    private function chairs(int $inStock = 30, array $extra = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'name' => 'Chairs', 'quantity' => $inStock, 'new_quantity' => 0, 'good_quantity' => $inStock,
            'fair_quantity' => 0, 'poor_quantity' => 0,
        ], $extra));
    }

    /** Lend $units (e.g. ['Good' => 10]) of $item to $event; stock is NOT reduced again here. */
    private function lend(Event $e, InventoryItem $item, array $units): EventInventoryItem
    {
        $b = new EventInventoryItem(['event_id' => $e->id, 'inventory_item_id' => $item->id]);
        $b->setUnits($units + ['New' => 0, 'Good' => 0, 'Fair' => 0, 'Poor' => 0]);
        $b->save();

        return $b;
    }

    private function giveBack(Event $e, EventInventoryItem $b, array $data = [], bool $photo = true)
    {
        if ($photo) {
            $data['photos'] = [$this->fakeImage('proof.jpg')];
        }

        return $this->actingAs($this->staff())->post(
            "/events/{$e->id}/borrowed-items/{$b->id}/release", $data, ['Accept' => 'application/json']
        );
    }

    private function files(): int
    {
        return count(Storage::disk('public')->allFiles('release_evidence_photos'));
    }

    // ---------------------------------------------------------------- the normal paths

    public function test_a_full_return_puts_every_unit_back_and_records_it_with_its_photo(): void
    {
        $e = $this->event();
        $item = $this->chairs(30);              // 30 in stock + 10 out on loan
        $b = $this->lend($e, $item, ['Good' => 10]);

        $this->giveBack($e, $b)->assertOk()->assertJsonPath('released_quantity', 10);

        $this->assertSame(40, $item->fresh()->quantity);
        $this->assertSame(40, $item->fresh()->good_quantity);
        $this->assertNull(EventInventoryItem::find($b->id), 'the loan is cleared');
        $r = EventInventoryRelease::firstOrFail();
        $this->assertSame(10, $r->quantity);
        $this->assertSame($e->id, $r->event_id);
        Storage::disk('public')->assertExists($r->evidence_photo_path);
        $this->assertTrue(ActivityLog::where('action', 'Return Items')->exists());
    }

    public function test_a_partial_return_by_condition_keeps_the_rest_on_loan(): void
    {
        $e = $this->event();
        $item = $this->chairs(20, ['quantity' => 20, 'good_quantity' => 18, 'fair_quantity' => 2]);
        $b = $this->lend($e, $item, ['Good' => 4, 'Fair' => 2]);        // 6 out

        $this->giveBack($e, $b, ['conditions' => ['Good' => 1, 'Fair' => 2]])->assertOk()->assertJsonPath('released_quantity', 3);

        $item = $item->fresh();
        $this->assertSame(23, $item->quantity);
        $this->assertSame(19, $item->good_quantity);
        $this->assertSame(4, $item->fair_quantity);
        $left = EventInventoryItem::findOrFail($b->id);
        $this->assertSame(3, $left->quantity);                          // 3 Good still out
        $this->assertSame(['New' => 0, 'Good' => 3, 'Fair' => 0, 'Poor' => 0], $left->resolvedUnits('Good'));
        $this->assertSame(3, EventInventoryRelease::firstOrFail()->quantity);
    }

    public function test_two_loans_of_the_same_item_returned_one_after_the_other_add_up_exactly(): void
    {
        $fiesta = $this->event('Fiesta');
        $sports = $this->event('Sports Fest');
        $item = $this->chairs(25);                                      // 25 + 10 + 5 = 40 chairs exist
        $a = $this->lend($fiesta, $item, ['Good' => 10]);
        $b = $this->lend($sports, $item, ['Good' => 5]);

        $this->giveBack($fiesta, $a)->assertOk();
        $this->giveBack($sports, $b)->assertOk();

        $this->assertSame(40, $item->fresh()->quantity);
        $this->assertSame(2, EventInventoryRelease::count());
    }

    public function test_returning_everything_for_an_event_at_once_credits_all_items(): void
    {
        $e = $this->event();
        $chairs = $this->chairs(30);
        $tables = InventoryItem::create(['name' => 'Tables', 'quantity' => 5, 'new_quantity' => 0, 'good_quantity' => 5, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $this->lend($e, $chairs, ['Good' => 10]);
        $this->lend($e, $tables, ['Good' => 3]);

        $this->actingAs($this->staff())->postJson("/events/{$e->id}/release-borrowed-items")->assertOk();

        $this->assertSame(40, $chairs->fresh()->quantity);
        $this->assertSame(8, $tables->fresh()->quantity);
        $this->assertSame(0, $e->borrowedItems()->count());
        $this->assertSame(2, EventInventoryRelease::count());
    }

    // ---------------------------------------------------------------- refusals change nothing

    public function test_a_return_without_a_photo_is_refused_and_changes_nothing(): void
    {
        $e = $this->event();
        $item = $this->chairs(30);
        $b = $this->lend($e, $item, ['Good' => 10]);

        $this->giveBack($e, $b, [], photo: false)->assertStatus(422);

        $this->assertSame(30, $item->fresh()->quantity);
        $this->assertNotNull(EventInventoryItem::find($b->id));
        $this->assertSame(0, EventInventoryRelease::count());
    }

    public function test_returning_more_than_is_on_loan_is_refused_and_changes_nothing(): void
    {
        $e = $this->event();
        $item = $this->chairs(30);
        $b = $this->lend($e, $item, ['Good' => 10]);

        $this->giveBack($e, $b, ['quantity' => 11])->assertStatus(422);
        $this->giveBack($e, $b, ['conditions' => ['Good' => 11]])->assertStatus(422);

        $this->assertSame(30, $item->fresh()->quantity);
        $this->assertSame(10, EventInventoryItem::find($b->id)->quantity);
        $this->assertSame(0, EventInventoryRelease::count());
        $this->assertSame(0, $this->files(), 'a refused return leaves no stray photo');
    }

    public function test_a_loan_that_was_already_returned_cannot_be_returned_twice(): void
    {
        $e = $this->event();
        $item = $this->chairs(30);
        $b = $this->lend($e, $item, ['Good' => 10]);

        $this->giveBack($e, $b)->assertOk();
        $this->giveBack($e, $b)->assertStatus(404);

        $this->assertSame(40, $item->fresh()->quantity, 'stock is credited once, not twice');
        $this->assertSame(1, EventInventoryRelease::count());
        $this->assertSame(1, $this->files(), 'the refused second attempt leaves no stray photo');
    }

    public function test_a_resident_cannot_return_items(): void
    {
        $e = $this->event();
        $b = $this->lend($e, $this->chairs(30), ['Good' => 10]);

        $this->actingAs($this->makeUser('Resident'))->post(
            "/events/{$e->id}/borrowed-items/{$b->id}/release",
            ['photos' => [$this->fakeImage('p.jpg')]], ['Accept' => 'application/json']
        )->assertStatus(403);
    }

    // ---------------------------------------------------------------- all-or-nothing

    public function test_if_saving_the_return_record_fails_nothing_at_all_changes(): void
    {
        $e = $this->event();
        $item = $this->chairs(30);
        $b = $this->lend($e, $item, ['Good' => 10]);

        // Simulate the last step failing (e.g. a database error) after the stock was credited.
        EventInventoryRelease::creating(fn () => throw new \RuntimeException('simulated failure'));

        $this->giveBack($e, $b)->assertStatus(500);

        $this->assertSame(30, $item->fresh()->quantity, 'stock must not be credited');
        $this->assertSame(10, EventInventoryItem::find($b->id)->quantity, 'the loan must still be there');
        $this->assertSame(0, EventInventoryRelease::count());
        $this->assertSame(0, ActivityLog::where('action', 'Return Items')->count());
        $this->assertSame(0, $this->files(), 'the uploaded photo is cleaned up');
    }

    public function test_after_a_failed_return_staff_can_simply_try_again(): void
    {
        $e = $this->event();
        $item = $this->chairs(30);
        $b = $this->lend($e, $item, ['Good' => 10]);

        EventInventoryRelease::creating(fn () => throw new \RuntimeException('simulated failure'));
        $this->giveBack($e, $b)->assertStatus(500);
        EventInventoryRelease::flushEventListeners();
        EventInventoryRelease::boot();

        $this->giveBack($e, $b)->assertOk();

        $this->assertSame(40, $item->fresh()->quantity);
        $this->assertSame(1, EventInventoryRelease::count());
    }

    public function test_if_the_bulk_return_fails_halfway_nothing_changes(): void
    {
        $e = $this->event();
        $chairs = $this->chairs(30);
        $tables = InventoryItem::create(['name' => 'Tables', 'quantity' => 5, 'new_quantity' => 0, 'good_quantity' => 5, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $this->lend($e, $chairs, ['Good' => 10]);
        $this->lend($e, $tables, ['Good' => 3]);

        $n = 0;
        EventInventoryRelease::creating(function () use (&$n) {
            if (++$n === 2) {
                throw new \RuntimeException('simulated failure on the second item');
            }
        });

        $this->actingAs($this->staff())->postJson("/events/{$e->id}/release-borrowed-items")->assertStatus(500);

        $this->assertSame(30, $chairs->fresh()->quantity);
        $this->assertSame(5, $tables->fresh()->quantity);
        $this->assertSame(2, $e->borrowedItems()->count());
        $this->assertSame(0, EventInventoryRelease::count());
    }

    // ---------------------------------------------------------------- the item was archived meanwhile

    public function test_an_item_on_loan_cannot_be_archived_until_it_is_returned(): void
    {
        $e = $this->event();
        $item = $this->chairs(30);
        $b = $this->lend($e, $item, ['Good' => 10]);

        try {
            $this->archived($item);                        // the database refuses: part of it is out on loan
            $this->fail('The item was archived while on loan.');
        } catch (\Illuminate\Database\QueryException $ex) {
            $this->assertStringContainsString('An item that is on loan cannot be archived', $ex->getMessage());
        }

        $this->giveBack($e, $b)->assertOk();
        $this->assertSame(40, InventoryItem::find($item->id)->quantity);
        $this->assertSame(1, EventInventoryRelease::count());

        $this->archived($item->fresh());                   // once everything is back it can be archived
        $this->assertNotNull(InventoryItem::withTrashed()->find($item->id)->deleted_at);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventInventoryItem;
use App\Models\InventoryItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers InventoryController::destroy()'s borrow guard: an item that is
 * currently lent out to a live event (i.e. has an outstanding
 * EventInventoryItem row) must not be deletable, because InventoryItem
 * only soft-deletes -- deleting a borrowed item would leave the event's
 * borrow record pointing at a "deleted" item, and returning it later
 * (event archived/edited) would silently restore quantity onto a record
 * no one can see or manage anymore. See app/Models/InventoryItem.php
 * (borrows()) and InventoryController::destroy().
 */
class InventoryBorrowGuardTest extends TestCase
{
    use RefreshDatabase;

    private function staffUser(): User
    {
        return User::create([
            'user_code'      => 'STAFF-' . uniqid(),
            'first_name'     => 'Staff',
            'last_name'      => 'Tester',
            'contact_number' => '09171234567',
            'role'           => 'Staff',
            'password'       => bcrypt('secret123'),
            'has_account'    => true,
        ]);
    }

    private function residentUser(): User
    {
        return User::create([
            'user_code'      => 'RES-' . uniqid(),
            'first_name'     => 'Resident',
            'last_name'      => 'Tester',
            'contact_number' => '09179876543',
            'role'           => 'Resident',
            'password'       => bcrypt('secret123'),
            'has_account'    => true,
        ]);
    }

    private function anEvent(): Event
    {
        return Event::create([
            'name'         => 'Test Event',
            'description'  => 'For borrow-guard testing',
            'location'     => 'Barangay Hall',
            'event_start'  => now()->addDay(),
        ]);
    }

    public function test_staff_can_delete_an_item_with_no_outstanding_borrows(): void
    {
        $staff = $this->staffUser();
        $item = InventoryItem::create([
            'name'     => 'Plastic Chairs',
            'quantity' => 50,
            'condition' => 'Good',
        ]);

        $response = $this->actingAs($staff)->deleteJson("/inventory/{$item->id}");

        $response->assertStatus(200);
        $this->assertSoftDeleted('inventory_items', ['id' => $item->id]);
    }

    public function test_staff_cannot_delete_an_item_that_is_currently_borrowed(): void
    {
        $staff = $this->staffUser();
        $item = InventoryItem::create([
            'name'     => 'Sound System',
            'quantity' => 1,
            'condition' => 'Good',
        ]);
        $event = $this->anEvent();
        EventInventoryItem::create([
            'event_id'           => $event->id,
            'inventory_item_id'  => $item->id,
            'quantity'           => 1,
        ]);

        $response = $this->actingAs($staff)->deleteJson("/inventory/{$item->id}");

        $response->assertStatus(409);
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'deleted_at' => null]);
    }

    public function test_item_becomes_deletable_again_once_its_borrow_record_is_gone(): void
    {
        // Mirrors what actually happens in the app: EventController
        // deletes the EventInventoryItem row (and restores quantity)
        // when the event is archived or edited to drop the item.
        $staff = $this->staffUser();
        $item = InventoryItem::create([
            'name'     => 'Tents',
            'quantity' => 5,
            'condition' => 'Good',
        ]);
        $event = $this->anEvent();
        $borrow = EventInventoryItem::create([
            'event_id'          => $event->id,
            'inventory_item_id' => $item->id,
            'quantity'          => 5,
        ]);

        $this->actingAs($staff)->deleteJson("/inventory/{$item->id}")->assertStatus(409);

        $borrow->delete();

        $response = $this->actingAs($staff)->deleteJson("/inventory/{$item->id}");
        $response->assertStatus(200);
        $this->assertSoftDeleted('inventory_items', ['id' => $item->id]);
    }

    public function test_resident_cannot_delete_inventory_items_at_all(): void
    {
        $resident = $this->residentUser();
        $item = InventoryItem::create([
            'name'     => 'Whiteboard',
            'quantity' => 2,
            'condition' => 'Good',
        ]);

        $response = $this->actingAs($resident)->deleteJson("/inventory/{$item->id}");

        $response->assertStatus(403);
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'deleted_at' => null]);
    }
}

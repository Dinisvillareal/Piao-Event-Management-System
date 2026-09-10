<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Models\EventInventoryItem;
use App\Models\InventoryItem;
use Illuminate\Database\Seeder;

class EventInventoryItemSeeder extends Seeder
{
    /**
     * Realistic "items borrowed for this event" rows, tied to the same
     * events EventSeeder created and the same items InventoryItemSeeder
     * created -- and, just like the real EventController does when staff
     * add a borrowed item, each borrow here actually deducts its quantity
     * from the InventoryItem row (see applyBorrowedItems() in that
     * controller). Skipping that deduction would leave the Inventory
     * report showing full stock on items that are also "borrowed" by an
     * event -- a phantom oversupply. Items marked Disposed/Lost, or
     * already at 0 quantity, are never assigned here, matching what the
     * real borrow picker would also refuse.
     *
     * Quantities below were sized against InventoryItemSeeder's starting
     * stock so nothing goes negative even after every assignment is
     * applied -- some items (e.g. the wheelchairs, the pension-release
     * lockbox) are deliberately drawn all the way to 0 so the Inventory
     * report has a believable mix of "still available" and "fully
     * committed" items to interpret, not just green across the board.
     *
     * Two event names are reused for both a past and a future occurrence
     * (Barangay Assembly Meeting, Community Feeding Program) -- borrows
     * here only target the PAST one of each, found via a date prefix, so
     * assignment doesn't silently land on whichever row happens to come
     * back first.
     */
    public function run(): void
    {
        $assignments = [
            ['event' => 'Barangay Clean-Up Drive', 'items' => [
                ['name' => 'Trash Bins (Segregated, 3-in-1)', 'qty' => 4],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 1],
                ['name' => 'Megaphone (Handheld)', 'qty' => 2],
            ]],
            ['event' => 'Senior Citizen Wellness Check', 'items' => [
                ['name' => 'Digital Blood Pressure Monitor', 'qty' => 3],
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
            ]],
            ['event' => 'Pantawid Pamilya Livelihood Workshop', 'items' => [
                ['name' => 'LCD Projector', 'qty' => 1],
                ['name' => 'Projector Screen (Portable)', 'qty' => 1],
                ['name' => 'Whiteboard (Standing, 4x6)', 'qty' => 1],
                ['name' => 'Folding Tables (6ft)', 'qty' => 6],
            ]],
            ['event' => 'Barangay Assembly Meeting', 'date' => '2026-06-10', 'items' => [
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 60],
                ['name' => 'Portable PA Sound System', 'qty' => 1],
                ['name' => 'Wireless Microphone Set', 'qty' => 2],
            ]],
            ['event' => 'Community Feeding Program', 'date' => '2026-06-14', 'items' => [
                ['name' => 'Rice Cooker (Industrial, 10L)', 'qty' => 2],
                ['name' => 'Cooking Gas Tank (11kg)', 'qty' => 2],
                ['name' => 'Food Trays (Stainless)', 'qty' => 100],
                ['name' => 'Folding Tables (6ft)', 'qty' => 4],
            ]],
            ['event' => 'PWD Accessibility Forum', 'items' => [
                ['name' => 'Wheelchairs (Standard)', 'qty' => 2],
                ['name' => 'Megaphone (Handheld)', 'qty' => 1],
            ]],
            ['event' => 'Emergency Relief Planning', 'items' => [
                ['name' => 'Rescue Rope (30m)', 'qty' => 3],
                ['name' => 'Emergency Relief Backpacks', 'qty' => 10],
                ['name' => 'Megaphone (Handheld)', 'qty' => 1],
            ]],
            ['event' => 'Senior Citizen Art Therapy', 'items' => [
                ['name' => 'Folding Tables (6ft)', 'qty' => 3],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 20],
            ]],
            ['event' => 'Health Insurance Claims Clinic', 'items' => [
                ['name' => 'Office Desktop Computer', 'qty' => 1],
                ['name' => 'Multipurpose Printer/Scanner', 'qty' => 1],
            ]],
            ['event' => 'Senior Citizen Legal Aid Clinic', 'items' => [
                ['name' => 'Folding Tables (6ft)', 'qty' => 2],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 15],
            ]],
            ['event' => 'Walang Gutom Food Budgeting Workshop', 'items' => [
                ['name' => 'LCD Projector', 'qty' => 1],
                ['name' => 'Whiteboard (Standing, 4x6)', 'qty' => 1],
            ]],
            ['event' => 'Emergency Relief Volunteer Training', 'items' => [
                ['name' => 'Rescue Rope (30m)', 'qty' => 2],
                ['name' => 'Life Vests (Adult)', 'qty' => 8],
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
            ]],
            ['event' => 'Pantawid Pamilya Health Awareness Day', 'items' => [
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
                ['name' => 'Digital Blood Pressure Monitor', 'qty' => 2],
            ]],
            ['event' => 'Health Insurance Family Wellness Check', 'items' => [
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
                ['name' => 'Extension Cords (Heavy Duty, 20m)', 'qty' => 2],
            ]],
            // Upcoming events -- staff reserving equipment ahead of time,
            // same as booking a venue in advance. Unlike attendance, there
            // is nothing date-dependent about borrowing, so upcoming
            // events are fair game here.
            ['event' => 'Senior Citizen Monthly Pension Release', 'items' => [
                ['name' => 'Queue Number Dispenser', 'qty' => 1],
                ['name' => 'Cash Handling Lockbox', 'qty' => 2],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 30],
            ]],
            ['event' => 'Solo Parent Wellness Circle', 'items' => [
                ['name' => 'Yoga Mats (Set of 10)', 'qty' => 2],
            ]],
            ['event' => 'PWD Assistive Devices Distribution', 'items' => [
                ['name' => 'Adjustable Crutches (Pair)', 'qty' => 6],
                ['name' => 'Walking Canes', 'qty' => 8],
                ['name' => 'Wheelchairs (Standard)', 'qty' => 2],
            ]],
            ['event' => 'Livelihood Skills Fair', 'items' => [
                ['name' => 'Sewing Machines (Manual)', 'qty' => 4],
                ['name' => 'Display Tables (Foldable)', 'qty' => 10],
                ['name' => 'Folding Tables (6ft)', 'qty' => 5],
            ]],
        ];

        foreach ($assignments as $assignment) {
            $query = Event::where('name', $assignment['event']);
            if (isset($assignment['date'])) {
                $query->where('event_start', 'like', $assignment['date'] . '%');
            }
            $event = $query->first();

            if (!$event) {
                continue;
            }

            foreach ($assignment['items'] as $line) {
                $item = InventoryItem::where('name', $line['name'])->first();

                if (!$item || in_array($item->condition, ['Disposed', 'Lost'], true)) {
                    continue;
                }

                $qty = (int) $line['qty'];

                if ($item->quantity < $qty) {
                    // Stock already spoken for by an earlier assignment in
                    // this list -- skip rather than push quantity negative.
                    continue;
                }

                $exists = EventInventoryItem::where('event_id', $event->id)
                    ->where('inventory_item_id', $item->id)
                    ->exists();
                if ($exists) {
                    continue;
                }

                $item->quantity -= $qty;
                $item->save();

                EventInventoryItem::create([
                    'event_id' => $event->id,
                    'inventory_item_id' => $item->id,
                    'quantity' => $qty,
                ]);
            }
        }
    }
}

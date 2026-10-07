<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Models\EventInventoryItem;
use App\Models\EventInventoryRelease;
use App\Models\InventoryItem;
use App\Models\User;
use Carbon\Carbon;
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
     * real borrow picker would also refuse. (Lost / disposed units are now
     * tracked as counts on the item and are never part of `quantity`, so the
     * in-stock number borrowed against here already excludes them.)
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
        $staffCodes = User::where('role', 'Staff')->orderBy('id')->pluck('user_code')->all();
        $returnCount = 0;

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

            // ---- August -> December 2026 events ----
            // mode 'returned': event is over and the equipment was already given back
            // (stock unchanged, a release is logged). 'pending': event is over but the
            // equipment is still out (shows in Returns). 'borrow': reserved for an
            // ongoing / upcoming event (stock deducted, loan open).
            ['event' => 'Barangay Health & Wellness Caravan', 'mode' => 'borrow', 'items' => [
                ['name' => 'Digital Blood Pressure Monitor', 'qty' => 2],
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
                ['name' => 'Folding Tables (6ft)', 'qty' => 4],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 30],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 2],
            ]],
            ['event' => 'Barangay Disaster Risk Reduction Orientation', 'mode' => 'borrow', 'items' => [
                ['name' => 'LCD Projector', 'qty' => 1],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 40],
            ]],
            ['event' => 'Pantawid Pamilya Family Day', 'mode' => 'borrow', 'items' => [
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 50],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 2],
                ['name' => 'Portable PA Sound System', 'qty' => 1],
            ]],
            ['event' => 'Senior Citizen Flu Vaccination', 'mode' => 'borrow', 'items' => [
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
                ['name' => 'Folding Tables (6ft)', 'qty' => 3],
                ['name' => 'Digital Blood Pressure Monitor', 'qty' => 2],
            ]],
            ['event' => 'Walang Gutom Harvest Festival', 'mode' => 'borrow', 'items' => [
                ['name' => 'Display Tables (Foldable)', 'qty' => 6],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 3],
                ['name' => 'Food Trays (Stainless)', 'qty' => 80],
            ]],
            ['event' => 'Barangay Safe Trick-or-Treat Parade', 'mode' => 'borrow', 'items' => [
                ['name' => 'Megaphone (Handheld)', 'qty' => 2],
                ['name' => 'Extension Cords (Heavy Duty, 20m)', 'qty' => 3],
            ]],
            ['event' => 'Emergency Relief Earthquake Drill', 'mode' => 'borrow', 'items' => [
                ['name' => 'Rescue Rope (30m)', 'qty' => 3],
                ['name' => 'Emergency Relief Backpacks', 'qty' => 15],
                ['name' => 'Megaphone (Handheld)', 'qty' => 2],
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
            ]],
            ['event' => 'Barangay Clean-Up & Recycling Drive', 'mode' => 'borrow', 'items' => [
                ['name' => 'Trash Bins (Segregated, 3-in-1)', 'qty' => 10],
                ['name' => 'Megaphone (Handheld)', 'qty' => 1],
            ]],
            ['event' => 'Livelihood Holiday Bazaar', 'mode' => 'borrow', 'items' => [
                ['name' => 'Display Tables (Foldable)', 'qty' => 12],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 4],
            ]],
            ['event' => 'PWD Christmas Party', 'mode' => 'borrow', 'items' => [
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 40],
                ['name' => 'Portable PA Sound System', 'qty' => 1],
            ]],
            ['event' => 'Senior Citizen Christmas Celebration', 'mode' => 'borrow', 'items' => [
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 80],
                ['name' => 'Folding Tables (6ft)', 'qty' => 6],
                ['name' => 'Portable PA Sound System', 'qty' => 1],
                ['name' => 'Wireless Microphone Set', 'qty' => 2],
                ['name' => 'Food Trays (Stainless)', 'qty' => 60],
            ]],
            ['event' => 'Barangay Year-End Assembly & Thanksgiving', 'mode' => 'borrow', 'items' => [
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 150],
                ['name' => 'Portable PA Sound System', 'qty' => 1],
                ['name' => 'Wireless Microphone Set', 'qty' => 2],
                ['name' => 'LCD Projector', 'qty' => 1],
            ]],
            ['event' => 'Buwan ng Wika Cultural Program', 'mode' => 'returned', 'items' => [
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 100],
                ['name' => 'Portable PA Sound System', 'qty' => 1],
                ['name' => 'Wireless Microphone Set', 'qty' => 2],
            ]],
            ['event' => 'Senior Citizen Blood Sugar Screening', 'mode' => 'returned', 'items' => [
                ['name' => 'Digital Blood Pressure Monitor', 'qty' => 2],
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
            ]],
            ['event' => 'Pantawid Pamilya Financial Literacy Seminar', 'mode' => 'returned', 'items' => [
                ['name' => 'LCD Projector', 'qty' => 1],
                ['name' => 'Whiteboard (Standing, 4x6)', 'qty' => 1],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 40],
            ]],
            ['event' => 'PWD Livelihood Skills Training', 'mode' => 'returned', 'items' => [
                ['name' => 'Sewing Machines (Manual)', 'qty' => 3],
                ['name' => 'Folding Tables (6ft)', 'qty' => 4],
            ]],
            ['event' => 'Solo Parent Livelihood Bazaar', 'mode' => 'returned', 'items' => [
                ['name' => 'Display Tables (Foldable)', 'qty' => 8],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 3],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 30],
            ]],
            ['event' => 'Walang Gutom Urban Gardening Workshop', 'mode' => 'returned', 'items' => [
                ['name' => 'Folding Tables (6ft)', 'qty' => 3],
                ['name' => 'Extension Cords (Heavy Duty, 20m)', 'qty' => 2],
            ]],
            ['event' => 'Health Insurance Dental Mission', 'mode' => 'returned', 'items' => [
                ['name' => 'First Aid Kit (Complete)', 'qty' => 3],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 20],
                ['name' => 'Extension Cords (Heavy Duty, 20m)', 'qty' => 3],
            ]],
            ['event' => 'Housing Program Community Planning', 'mode' => 'returned', 'items' => [
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 40],
                ['name' => 'Whiteboard (Standing, 4x6)', 'qty' => 1],
            ]],
            ['event' => 'Educational Assistance Tutorial Kickoff', 'mode' => 'returned', 'items' => [
                ['name' => 'LCD Projector', 'qty' => 1],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 30],
                ['name' => 'Whiteboard (Standing, 4x6)', 'qty' => 1],
            ]],
            ['event' => 'Barangay Flood Preparedness Drill', 'mode' => 'returned', 'items' => [
                ['name' => 'Life Vests (Adult)', 'qty' => 6],
                ['name' => 'Rescue Rope (30m)', 'qty' => 3],
                ['name' => 'Megaphone (Handheld)', 'qty' => 2],
                ['name' => 'First Aid Kit (Complete)', 'qty' => 2],
            ]],
            ['event' => 'Senior Citizen Zumba & Wellness Session', 'mode' => 'returned', 'items' => [
                ['name' => 'Yoga Mats (Set of 10)', 'qty' => 3],
                ['name' => 'Portable PA Sound System', 'qty' => 1],
                ['name' => 'Extension Cords (Heavy Duty, 20m)', 'qty' => 2],
            ]],
            ['event' => 'Barangay Tree Planting Day', 'mode' => 'pending', 'items' => [
                ['name' => 'Trash Bins (Segregated, 3-in-1)', 'qty' => 4],
                ['name' => 'Megaphone (Handheld)', 'qty' => 1],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 2],
            ]],
            ['event' => 'Livelihood Product Showcase', 'mode' => 'returned', 'items' => [
                ['name' => 'Display Tables (Foldable)', 'qty' => 10],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 3],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 40],
            ]],
            ['event' => 'PWD Sign Language Basics Workshop', 'mode' => 'returned', 'items' => [
                ['name' => 'LCD Projector', 'qty' => 1],
                ['name' => 'Whiteboard (Standing, 4x6)', 'qty' => 1],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 25],
            ]],
            ['event' => 'Pantawid Pamilya Nutrition & Cooking Demo', 'mode' => 'returned', 'items' => [
                ['name' => 'Rice Cooker (Industrial, 10L)', 'qty' => 2],
                ['name' => 'Cooking Gas Tank (11kg)', 'qty' => 2],
                ['name' => 'Folding Tables (6ft)', 'qty' => 4],
            ]],
            ['event' => 'Emergency Relief Mock Evacuation', 'mode' => 'returned', 'items' => [
                ['name' => 'Rescue Rope (30m)', 'qty' => 2],
                ['name' => 'Megaphone (Handheld)', 'qty' => 2],
                ['name' => 'Emergency Relief Backpacks', 'qty' => 10],
            ]],
            ['event' => 'Solo Parent Counseling Day', 'mode' => 'returned', 'items' => [
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 30],
                ['name' => 'Folding Tables (6ft)', 'qty' => 3],
            ]],
            ['event' => 'Health Insurance Vaccination Drive', 'mode' => 'returned', 'items' => [
                ['name' => 'First Aid Kit (Complete)', 'qty' => 3],
                ['name' => 'Folding Tables (6ft)', 'qty' => 4],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 30],
                ['name' => 'Digital Blood Pressure Monitor', 'qty' => 2],
            ]],
            ['event' => 'Barangay Sports Fest Opening', 'mode' => 'pending', 'items' => [
                ['name' => 'Portable PA Sound System', 'qty' => 1],
                ['name' => 'Megaphone (Handheld)', 'qty' => 2],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 80],
                ['name' => 'Event Canopy Tent (10x10)', 'qty' => 2],
            ]],
            ['event' => 'Educational Assistance School Supplies Distribution', 'mode' => 'returned', 'items' => [
                ['name' => 'Folding Tables (6ft)', 'qty' => 5],
                ['name' => 'Plastic Monobloc Chairs', 'qty' => 20],
                ['name' => 'Extension Cords (Heavy Duty, 20m)', 'qty' => 2],
            ]],
        ];

        // Equipment that was already given back (events that are over) is
        // settled first, as it happened before any open loan reserved stock.
        usort($assignments, fn ($a, $b) => (int) (($b['mode'] ?? null) === 'returned') <=> (int) (($a['mode'] ?? null) === 'returned'));

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

                if (!$item) {
                    continue;
                }

                $qty = (int) $line['qty'];

                if ($item->quantity < $qty) {
                    // Stock already spoken for by an earlier assignment in
                    // this list -- skip rather than push quantity negative.
                    continue;
                }

                // Equipment for an event that is already over and was given
                // back: nothing is deducted or left on loan -- only the
                // return itself is recorded (a few hours after the event
                // ended), the same row EventController::releaseBorrowedItem
                // would have written.
                if (($assignment['mode'] ?? null) === 'returned') {
                    $alreadyLogged = EventInventoryRelease::where('event_id', $event->id)
                        ->where('inventory_item_id', $item->id)
                        ->exists();
                    if (!$alreadyLogged) {
                        $endedAt = Carbon::parse($event->event_end ?? $event->event_start);
                        $at = $endedAt->copy()->addHours(2 + ($returnCount % 3));
                        if ($at->greaterThan(now())) {
                            $at = now()->subMinutes(30);
                        }

                        // forceFill so the backdated created_at is kept.
                        (new EventInventoryRelease())->forceFill([
                            'event_id' => $event->id,
                            'inventory_item_id' => $item->id,
                            'quantity' => $qty,
                            'released_by' => $staffCodes[$returnCount % max(count($staffCodes), 1)] ?? null,
                            'created_at' => $at,
                            'updated_at' => $at,
                        ])->save();
                        $returnCount++;
                    }
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

<?php

namespace Database\Seeders;

use App\Models\InventoryItem;
use Illuminate\Database\Seeder;

class InventoryItemSeeder extends Seeder
{
    /**
     * Realistic barangay equipment/supplies inventory -- the kind of gear
     * actually used to run the events seeded by EventSeeder (tables,
     * chairs, sound system, tents, first-aid kit, etc.), so the Inventory
     * module doesn't start out empty and disconnected from everything else.
     *
     * Lost / disposed gear is recorded the way the app now records it: as
     * UNIT counts on the item (lost_quantity, lost_pending, disposed_quantity),
     * never by tagging a whole row Lost/Disposed -- so a few missing or
     * worn-out units don't take the still-good ones out of Inventory. `quantity`
     * is always the in-stock count and never includes lost/disposed units.
     * lost_pending is the part of lost_quantity that was out on loan when it
     * was reported (settled once that loan closes, see
     * InventoryItem::settleLostOnLoan).
     *
     * Stock levels are sized so EventInventoryItemSeeder can reserve and return
     * equipment for every event from August through December 2026 without
     * running out, while a few items (wheelchairs, lockbox, first-aid
     * kits...) are still deliberately drawn down to show a mix of available
     * and fully-committed stock.
     */
    public function run(): void
    {
        $items = [
            ['name' => 'Plastic Monobloc Chairs', 'quantity' => 650, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Storage Room', 'notes' => 'Used for assemblies and seminars.'],
            ['name' => 'Folding Tables (6ft)', 'quantity' => 50, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Storage Room', 'notes' => 'For registration and feeding programs.'],
            ['name' => 'Portable PA Sound System', 'quantity' => 6, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'One spare battery pack included.'],
            ['name' => 'Wireless Microphone Set', 'quantity' => 8, 'condition' => 'Fair', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'One unit has a weak battery contact.'],
            ['name' => 'Event Canopy Tent (10x10)', 'quantity' => 18, 'lost_quantity' => 1, 'condition' => 'Good', 'storage_location' => 'Motorpool Shed', 'notes' => 'Used for outdoor feeding and clean-up drives. One tent lost after a clean-up drive.'],
            ['name' => 'First Aid Kit (Complete)', 'quantity' => 24, 'condition' => 'New', 'storage_location' => 'Health Center Cabinet', 'notes' => 'Restocked quarterly.'],
            ['name' => 'Digital Blood Pressure Monitor', 'quantity' => 10, 'condition' => 'Good', 'storage_location' => 'Health Center Cabinet', 'notes' => 'For Senior Citizen Wellness Checks.'],
            ['name' => 'LCD Projector', 'quantity' => 5, 'condition' => 'Fair', 'storage_location' => 'Community Training Room', 'notes' => 'Used for livelihood and training workshops.'],
            ['name' => 'Projector Screen (Portable)', 'quantity' => 2, 'condition' => 'Good', 'storage_location' => 'Community Training Room', 'notes' => null],
            ['name' => 'Rice Cooker (Industrial, 10L)', 'quantity' => 5, 'condition' => 'Good', 'storage_location' => 'Feeding Program Kitchen', 'notes' => 'For Community Feeding Program.'],
            ['name' => 'Cooking Gas Tank (11kg)', 'quantity' => 8, 'condition' => 'Good', 'storage_location' => 'Feeding Program Kitchen', 'notes' => null],
            ['name' => 'Food Trays (Stainless)', 'quantity' => 295, 'disposed_quantity' => 5, 'condition' => 'Fair', 'storage_location' => 'Feeding Program Kitchen', 'notes' => 'Some trays showing wear.'],
            ['name' => 'Whiteboard (Standing, 4x6)', 'quantity' => 5, 'condition' => 'Good', 'storage_location' => 'Community Training Room', 'notes' => null],
            ['name' => 'Office Desktop Computer', 'quantity' => 4, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'For encoding and reports.'],
            ['name' => 'Multipurpose Printer/Scanner', 'quantity' => 2, 'condition' => 'Fair', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'One unit needs a new drum.'],
            ['name' => 'Megaphone (Handheld)', 'quantity' => 14, 'disposed_quantity' => 1, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'For clean-up drives and emergency drills. One unit disposed -- cracked horn.'],
            ['name' => 'Rescue Rope (30m)', 'quantity' => 12, 'condition' => 'Good', 'storage_location' => 'Emergency Relief Storage', 'notes' => 'For Emergency Relief Program.'],
            ['name' => 'Emergency Relief Backpacks', 'quantity' => 70, 'condition' => 'New', 'storage_location' => 'Emergency Relief Storage', 'notes' => 'Pre-packed with basic supplies.'],
            ['name' => 'Wheelchairs (Standard)', 'quantity' => 4, 'condition' => 'Good', 'storage_location' => 'Barangay Health Center', 'notes' => 'For PWD Assistance program use.'],
            ['name' => 'Old Karaoke Speaker Set', 'quantity' => 0, 'disposed_quantity' => 1, 'condition' => 'Poor', 'storage_location' => 'Motorpool Shed', 'notes' => 'Beyond repair -- disposed.'],
            ['name' => 'Barangay Tarpaulin Banner Stand', 'quantity' => 3, 'condition' => 'Poor', 'storage_location' => 'Barangay Hall Storage Room', 'notes' => 'Frame is bent on one stand.'],
            ['name' => 'Extension Cords (Heavy Duty, 20m)', 'quantity' => 24, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => null],

            // Tied to the newer, dynamically-dated upcoming events in
            // EventSeeder (Barangay Assembly Meeting, Senior Citizen
            // Monthly Pension Release, Solo Parent Wellness Circle, PWD
            // Assistive Devices Distribution, Livelihood Skills Fair) --
            // and giving the Inventory report both condition variety and
            // real lost / disposed unit counts to show.
            ['name' => 'Yoga Mats (Set of 10)', 'quantity' => 10, 'condition' => 'Good', 'storage_location' => 'Community Training Room', 'notes' => 'For Solo Parent Wellness Circle sessions.'],
            ['name' => 'Adjustable Crutches (Pair)', 'quantity' => 18, 'condition' => 'Good', 'storage_location' => 'Barangay Health Center', 'notes' => 'For PWD Assistive Devices Distribution.'],
            ['name' => 'Walking Canes', 'quantity' => 25, 'condition' => 'New', 'storage_location' => 'Barangay Health Center', 'notes' => 'For PWD Assistive Devices Distribution.'],
            ['name' => 'Queue Number Dispenser', 'quantity' => 1, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'For Senior Citizen Pension Release queueing.'],
            ['name' => 'Cash Handling Lockbox', 'quantity' => 2, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'For Senior Citizen Pension Release payouts.'],
            ['name' => 'Sewing Machines (Manual)', 'quantity' => 10, 'condition' => 'Fair', 'storage_location' => 'Motorpool Shed', 'notes' => 'For Livelihood Skills Fair training booth.'],
            ['name' => 'Display Tables (Foldable)', 'quantity' => 40, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Storage Room', 'notes' => 'For Livelihood Skills Fair vendor booths.'],
            ['name' => 'Bluetooth Speaker (Portable)', 'quantity' => 0, 'lost_quantity' => 1, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'Reported missing after a Barangay Assembly Meeting.'],
            ['name' => 'Trash Bins (Segregated, 3-in-1)', 'quantity' => 22, 'disposed_quantity' => 2, 'condition' => 'Poor', 'storage_location' => 'Motorpool Shed', 'notes' => 'For clean-up drives; several lids cracked.'],
            ['name' => 'Life Vests (Adult)', 'quantity' => 14, 'lost_quantity' => 1, 'lost_pending' => 1, 'condition' => 'New', 'storage_location' => 'Emergency Relief Storage', 'notes' => 'For flood emergency response. One vest reported lost while out on loan (settled once that loan closes).'],
            ['name' => 'Broken Office Chair', 'quantity' => 0, 'disposed_quantity' => 2, 'condition' => 'Poor', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'Disposed -- backrest cracked.'],
            ['name' => 'Public Address Speaker (Backup Unit)', 'quantity' => 0, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'Currently out for repair -- none in stock right now.'],
        ];

        foreach ($items as $item) {
            // Unit counters default to 0 for anything not listed above.
            $item += ['lost_quantity' => 0, 'lost_pending' => 0, 'disposed_quantity' => 0];

            InventoryItem::firstOrCreate(
                ['name' => $item['name']],
                $item
            );
        }
    }
}

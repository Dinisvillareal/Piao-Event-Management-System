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
     */
    public function run(): void
    {
        $items = [
            ['name' => 'Plastic Monobloc Chairs', 'quantity' => 150, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Storage Room', 'notes' => 'Used for assemblies and seminars.'],
            ['name' => 'Folding Tables (6ft)', 'quantity' => 20, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Storage Room', 'notes' => 'For registration and feeding programs.'],
            ['name' => 'Portable PA Sound System', 'quantity' => 2, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'One spare battery pack included.'],
            ['name' => 'Wireless Microphone Set', 'quantity' => 4, 'condition' => 'Fair', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'One unit has a weak battery contact.'],
            ['name' => 'Event Canopy Tent (10x10)', 'quantity' => 6, 'condition' => 'Good', 'storage_location' => 'Motorpool Shed', 'notes' => 'Used for outdoor feeding and clean-up drives.'],
            ['name' => 'First Aid Kit (Complete)', 'quantity' => 8, 'condition' => 'New', 'storage_location' => 'Health Center Cabinet', 'notes' => 'Restocked quarterly.'],
            ['name' => 'Digital Blood Pressure Monitor', 'quantity' => 5, 'condition' => 'Good', 'storage_location' => 'Health Center Cabinet', 'notes' => 'For Senior Citizen Wellness Checks.'],
            ['name' => 'LCD Projector', 'quantity' => 2, 'condition' => 'Fair', 'storage_location' => 'Community Training Room', 'notes' => 'Used for livelihood and training workshops.'],
            ['name' => 'Projector Screen (Portable)', 'quantity' => 2, 'condition' => 'Good', 'storage_location' => 'Community Training Room', 'notes' => null],
            ['name' => 'Rice Cooker (Industrial, 10L)', 'quantity' => 3, 'condition' => 'Good', 'storage_location' => 'Feeding Program Kitchen', 'notes' => 'For Community Feeding Program.'],
            ['name' => 'Cooking Gas Tank (11kg)', 'quantity' => 4, 'condition' => 'Good', 'storage_location' => 'Feeding Program Kitchen', 'notes' => null],
            ['name' => 'Food Trays (Stainless)', 'quantity' => 200, 'condition' => 'Fair', 'storage_location' => 'Feeding Program Kitchen', 'notes' => 'Some trays showing wear.'],
            ['name' => 'Whiteboard (Standing, 4x6)', 'quantity' => 3, 'condition' => 'Good', 'storage_location' => 'Community Training Room', 'notes' => null],
            ['name' => 'Office Desktop Computer', 'quantity' => 4, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'For encoding and reports.'],
            ['name' => 'Multipurpose Printer/Scanner', 'quantity' => 2, 'condition' => 'Fair', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'One unit needs a new drum.'],
            ['name' => 'Megaphone (Handheld)', 'quantity' => 5, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'For clean-up drives and emergency drills.'],
            ['name' => 'Rescue Rope (30m)', 'quantity' => 6, 'condition' => 'Good', 'storage_location' => 'Emergency Relief Storage', 'notes' => 'For Emergency Relief Program.'],
            ['name' => 'Emergency Relief Backpacks', 'quantity' => 40, 'condition' => 'New', 'storage_location' => 'Emergency Relief Storage', 'notes' => 'Pre-packed with basic supplies.'],
            ['name' => 'Wheelchairs (Standard)', 'quantity' => 4, 'condition' => 'Good', 'storage_location' => 'Barangay Health Center', 'notes' => 'For PWD Assistance program use.'],
            ['name' => 'Old Karaoke Speaker Set', 'quantity' => 1, 'condition' => 'Disposed', 'storage_location' => 'Motorpool Shed', 'notes' => 'Beyond repair, pending disposal approval.'],
            ['name' => 'Barangay Tarpaulin Banner Stand', 'quantity' => 3, 'condition' => 'Poor', 'storage_location' => 'Barangay Hall Storage Room', 'notes' => 'Frame is bent on one stand.'],
            ['name' => 'Extension Cords (Heavy Duty, 20m)', 'quantity' => 10, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => null],

            // Tied to the newer, dynamically-dated upcoming events in
            // EventSeeder (Barangay Assembly Meeting, Senior Citizen
            // Monthly Pension Release, Solo Parent Wellness Circle, PWD
            // Assistive Devices Distribution, Livelihood Skills Fair) --
            // and rounding out every InventoryItem `condition` value
            // (including Lost, which nothing previously used) so the
            // Inventory report's by-condition breakdown and the borrow
            // picker's Disposed/Lost exclusion both have something real
            // to show.
            ['name' => 'Yoga Mats (Set of 10)', 'quantity' => 5, 'condition' => 'Good', 'storage_location' => 'Community Training Room', 'notes' => 'For Solo Parent Wellness Circle sessions.'],
            ['name' => 'Adjustable Crutches (Pair)', 'quantity' => 12, 'condition' => 'Good', 'storage_location' => 'Barangay Health Center', 'notes' => 'For PWD Assistive Devices Distribution.'],
            ['name' => 'Walking Canes', 'quantity' => 15, 'condition' => 'New', 'storage_location' => 'Barangay Health Center', 'notes' => 'For PWD Assistive Devices Distribution.'],
            ['name' => 'Queue Number Dispenser', 'quantity' => 1, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'For Senior Citizen Pension Release queueing.'],
            ['name' => 'Cash Handling Lockbox', 'quantity' => 2, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'For Senior Citizen Pension Release payouts.'],
            ['name' => 'Sewing Machines (Manual)', 'quantity' => 6, 'condition' => 'Fair', 'storage_location' => 'Motorpool Shed', 'notes' => 'For Livelihood Skills Fair training booth.'],
            ['name' => 'Display Tables (Foldable)', 'quantity' => 15, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Storage Room', 'notes' => 'For Livelihood Skills Fair vendor booths.'],
            ['name' => 'Bluetooth Speaker (Portable)', 'quantity' => 0, 'condition' => 'Lost', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'Reported missing after a Barangay Assembly Meeting.'],
            ['name' => 'Trash Bins (Segregated, 3-in-1)', 'quantity' => 10, 'condition' => 'Poor', 'storage_location' => 'Motorpool Shed', 'notes' => 'For clean-up drives; several lids cracked.'],
            ['name' => 'Life Vests (Adult)', 'quantity' => 8, 'condition' => 'New', 'storage_location' => 'Emergency Relief Storage', 'notes' => 'For flood emergency response.'],
            ['name' => 'Broken Office Chair', 'quantity' => 2, 'condition' => 'Disposed', 'storage_location' => 'Barangay Hall Admin Office', 'notes' => 'Awaiting disposal -- backrest cracked.'],
            ['name' => 'Public Address Speaker (Backup Unit)', 'quantity' => 0, 'condition' => 'Good', 'storage_location' => 'Barangay Hall Equipment Room', 'notes' => 'Currently out for repair -- none in stock right now.'],
        ];

        foreach ($items as $item) {
            InventoryItem::firstOrCreate(
                ['name' => $item['name']],
                $item
            );
        }
    }
}

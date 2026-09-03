<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\Event;
use App\Models\Household;
use App\Models\User;
use Illuminate\Database\Seeder;

class ActivityLogSeeder extends Seeder
{
    /**
     * Realistic audit trail seeded from the actual rows the other seeders
     * just created (real staff user_codes, real event names, real
     * household codes) -- entries mirror the exact action/module/
     * description shape the controllers themselves write via
     * createLog(), so the Activity Logs screen doesn't start out either
     * empty or full of make-believe records.
     */
    public function run(): void
    {
        $staffCodes = User::where('role', 'Staff')->limit(3)->pluck('user_code')->all();
        $actor = fn(int $i) => $staffCodes[$i % max(count($staffCodes), 1)] ?? 'SYSTEM';

        $entries = [];
        $i = 0;

        foreach (Household::orderBy('id')->limit(4)->get() as $household) {
            $entries[] = [
                'user_code' => $actor($i++),
                'action' => 'Create Household',
                'module' => 'Households',
                'description' => "Created household {$household->code}",
            ];
        }

        foreach (Event::orderBy('event_start')->limit(6)->get() as $event) {
            $entries[] = [
                'user_code' => $actor($i++),
                'action' => 'Create Event',
                'module' => 'Events',
                'description' => "Created event: {$event->name}",
            ];
        }

        $entries[] = [
            'user_code' => $actor($i++),
            'action' => 'Create',
            'module' => 'Inventory',
            'description' => 'Added inventory item: Plastic Monobloc Chairs',
        ];
        $entries[] = [
            'user_code' => $actor($i++),
            'action' => 'Update',
            'module' => 'Inventory',
            'description' => 'Updated inventory item: Wireless Microphone Set',
        ];
        $entries[] = [
            'user_code' => $actor($i++),
            'action' => 'Update Age Bracket',
            'module' => 'Age Bracket',
            'description' => 'Updated age bracket: Senior Citizen',
        ];
        $entries[] = [
            'user_code' => 'SYSTEM',
            'action' => 'Database Seed',
            'module' => 'System',
            'description' => 'Demo data seeded for households, events, budget, inventory, and feedback.',
        ];

        foreach ($entries as $entry) {
            ActivityLog::create($entry);
        }
    }
}

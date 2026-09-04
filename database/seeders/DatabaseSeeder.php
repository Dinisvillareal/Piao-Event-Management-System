<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Account;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Adviser example (Senior Citizen eligibility) extended to Youth /
        // Solo Parent -- must run first so UserSeeder / MembershipSeeder can
        // reference real age bracket / civil status ids.
        $this->call([
            AgeBracketSeeder::class,
            CivilStatusSeeder::class,
        ]);
        $this->call([
            UserSeeder::class,
        ]);
        // Real Household module -- groups seeded residents into households
        // (must run after UserSeeder, before anything that reports on SMS
        // grouping / household membership).
        $this->call([
            HouseholdSeeder::class,
        ]);
        // Add MembershipSeeder here
        $this->call([
            MembershipSeeder::class,
        ]);
        $this->call([
            MembershipResidentSeeder::class,
        ]);
        $this->call([
            EventSeeder::class,
        ]);
        $this->call([
            EventAttendanceSeeder::class,
        ]);
        // Realistic, interconnected demo data for the remaining modules --
        // each references real rows from the seeders above instead of
        // standing alone.
        $this->call([
            InventoryItemSeeder::class,
        ]);
        $this->call([
            EventInventoryItemSeeder::class,
        ]);
        $this->call([
            EventExpenseSeeder::class,
        ]);
        $this->call([
            FeedbackSeeder::class,
        ]);
        // Must run last -- it reads back the households/events/inventory
        // rows every seeder above just created to build a realistic audit
        // trail referencing them.
        $this->call([
            ActivityLogSeeder::class,
        ]);
    }
}

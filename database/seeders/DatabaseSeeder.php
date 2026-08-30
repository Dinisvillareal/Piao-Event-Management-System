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

    }
}

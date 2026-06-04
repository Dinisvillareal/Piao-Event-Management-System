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

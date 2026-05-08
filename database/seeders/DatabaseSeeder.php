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
        User::factory(20)->create()->each(function ($user) {
            Account::create([
                'user_id' => $user->id,
                'username' => fake()->userName(),
                'password' => bcrypt('password123'),
            ]);
        });
        
        // Add MembershipSeeder here
        $this->call([
            MembershipSeeder::class,
        ]);

        $this->call([
            EventSeeder::class,
        ]);
    }
}
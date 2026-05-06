<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Membership;

class MembershipSeeder extends Seeder
{
    public function run(): void
    {
        Membership::create(['name' => 'Pantawid Pamilya']);
        Membership::create(['name' => 'Walang Gutom']);
    }
}
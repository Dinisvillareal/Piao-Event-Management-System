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
        Membership::create(['name' => 'Senior Citizen Program']);
        Membership::create(['name' => 'PWD Assistance']);
        Membership::create(['name' => 'Solo Parent Support']);
        Membership::create(['name' => 'Health Insurance Program']);
        Membership::create(['name' => 'Livelihood Assistance']);
        Membership::create(['name' => 'Educational Assistance']);
        Membership::create(['name' => 'Housing Support Program']);
        Membership::create(['name' => 'Emergency Relief Program']);
    }
}

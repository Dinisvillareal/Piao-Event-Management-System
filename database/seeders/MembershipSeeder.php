<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Membership;

class MembershipSeeder extends Seeder
{
    public function run(): void
    {
        Membership::create([
            'name' => 'Pantawid Pamilya',
            'description' => 'Conditional cash transfer program for qualified households to support health and education needs of children aged 0-18'
        ]);

        Membership::create([
            'name' => 'Walang Gutom',
            'description' => 'Food security program providing monthly food subsidies and nutrition support to food-poor families'
        ]);

        Membership::create([
            'name' => 'Senior Citizen Program',
            'description' => 'Social pension and benefits for Filipino senior citizens aged 60 and above including discounts and monthly stipend'
        ]);

        Membership::create([
            'name' => 'PWD Assistance',
            'description' => 'Comprehensive support program for Persons with Disabilities including medical assistance, discounts, and livelihood opportunities'
        ]);

        Membership::create([
            'name' => 'Solo Parent Support',
            'description' => 'Assistance program for solo parents providing parental leave benefits, educational support, and livelihood training'
        ]);

        Membership::create([
            'name' => 'Health Insurance Program',
            'description' => 'PhilHealth coverage and medical assistance for inpatient and outpatient services including preventive healthcare'
        ]);

        Membership::create([
            'name' => 'Livelihood Assistance',
            'description' => 'Skills training, startup capital, and business development support for micro-enterprises and self-employed individuals'
        ]);

        Membership::create([
            'name' => 'Educational Assistance',
            'description' => 'Scholarship grants, school supplies, and allowances for elementary, high school, and college students from low-income families'
        ]);

        Membership::create([
            'name' => 'Housing Support Program',
            'description' => 'Affordable housing loans, shelter assistance, and relocation support for informal settler families'
        ]);

        Membership::create([
            'name' => 'Emergency Relief Program',
            'description' => 'Immediate disaster response including food packs, hygiene kits, temporary shelter, and cash assistance for calamity victims'
        ]);
    }
}

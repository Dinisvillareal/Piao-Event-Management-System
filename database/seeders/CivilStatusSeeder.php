<?php

namespace Database\Seeders;

use App\Models\CivilStatus;
use Illuminate\Database\Seeder;

/**
 * Adviser example (Senior Citizen eligibility) extended to a
 * Staff-configurable civil/current status list (Settings -> Age & Status
 * Categories) -- covers Solo Parent ("single mom"), etc. updateOrCreate()
 * keeps this safe to re-run alongside the migration's own default insert.
 */
class CivilStatusSeeder extends Seeder
{
    public function run(): void
    {
        $statuses = [
            ['label' => 'Single',      'sort_order' => 1],
            ['label' => 'Married',     'sort_order' => 2],
            ['label' => 'Widowed',     'sort_order' => 3],
            ['label' => 'Separated',   'sort_order' => 4],
            ['label' => 'Solo Parent', 'sort_order' => 5],
        ];

        foreach ($statuses as $status) {
            CivilStatus::updateOrCreate(['label' => $status['label']], $status);
        }
    }
}

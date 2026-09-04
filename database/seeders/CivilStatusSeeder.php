<?php

namespace Database\Seeders;

use App\Models\CivilStatus;
use Illuminate\Database\Seeder;

/**
 * Adviser example (Senior Citizen eligibility) extended to a
 * Staff-configurable civil status list (Settings -> Age & Status
 * Categories) -- purely marital/relationship status. Solo Parent and
 * other independent life-situation categories live in CurrentStatus
 * instead (see CurrentStatusSeeder). updateOrCreate() keeps this safe
 * to re-run alongside the migration's own default insert.
 */
class CivilStatusSeeder extends Seeder
{
    public function run(): void
    {
        $statuses = [
            ['label' => 'Single',                       'sort_order' => 1],
            ['label' => 'Married',                      'sort_order' => 2],
            ['label' => 'Widowed',                      'sort_order' => 3],
            ['label' => 'Separated',                    'sort_order' => 4],
            ['label' => 'Divorced',                     'sort_order' => 5],
            ['label' => 'Annulled',                     'sort_order' => 6],
            ['label' => 'Live-in / Common-law Partner', 'sort_order' => 7],
        ];

        foreach ($statuses as $status) {
            CivilStatus::updateOrCreate(['label' => $status['label']], $status);
        }
    }
}

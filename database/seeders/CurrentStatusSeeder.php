<?php

namespace Database\Seeders;

use App\Models\CurrentStatus;
use Illuminate\Database\Seeder;

/**
 * Staff-configurable "current status" list (Settings -> Age & Status
 * Categories) -- independent life-situation / social-welfare categories
 * (Solo Parent, PWD, indigent, etc.), kept separate from marital/civil
 * status since a resident can carry more than one of these at once.
 * updateOrCreate() keeps this safe to re-run alongside the migration's
 * own default insert.
 */
class CurrentStatusSeeder extends Seeder
{
    public function run(): void
    {
        $statuses = [
            ['label' => 'Solo Parent',                  'sort_order' => 1],
            ['label' => 'Person with Disability (PWD)', 'sort_order' => 2],
            ['label' => 'Indigent',                     'sort_order' => 3],
            ['label' => 'Out-of-School Youth',          'sort_order' => 4],
            ['label' => 'OFW Dependent',                'sort_order' => 5],
            ['label' => 'Unemployed',                   'sort_order' => 6],
        ];

        foreach ($statuses as $status) {
            CurrentStatus::updateOrCreate(['label' => $status['label']], $status);
        }
    }
}

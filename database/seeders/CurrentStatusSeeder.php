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
            ['label' => 'Solo Parent',                  'category' => 'household', 'sort_order' => 1],
            ['label' => 'Person with Disability (PWD)', 'category' => 'sector', 'sort_order' => 2],
            ['label' => 'Indigent',                     'category' => 'economic', 'sort_order' => 3],
            ['label' => 'Out-of-School Youth',          'category' => 'employment', 'sort_order' => 4],
            ['label' => 'OFW Dependent',                'category' => 'household', 'sort_order' => 5],
            ['label' => 'Unemployed',                   'category' => 'employment', 'sort_order' => 6],
            ['label' => 'Student',                      'category' => 'employment', 'sort_order' => 7],
            ['label' => 'Employed',                     'category' => 'employment', 'sort_order' => 8],
            ['label' => 'Self-employed',                'category' => 'employment', 'sort_order' => 9],
            ['label' => 'Retired',                      'category' => 'employment', 'sort_order' => 10],
            ['label' => '4Ps Beneficiary',              'category' => 'economic',   'sort_order' => 11],
            ['label' => 'Indigenous Person',            'category' => 'sector',     'sort_order' => 12],
        ];

        foreach ($statuses as $status) {
            CurrentStatus::updateOrCreate(['label' => $status['label']], $status);
        }
    }
}

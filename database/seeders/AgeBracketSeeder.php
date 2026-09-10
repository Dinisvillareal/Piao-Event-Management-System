<?php

namespace Database\Seeders;

use App\Models\AgeBracket;
use Illuminate\Database\Seeder;

/**
 * Adviser example (Senior Citizen eligibility) extended to Youth / Adult /
 * Child: Staff-configurable age brackets (Settings -> Age & Status
 * Categories). updateOrCreate() keeps this safe to re-run even though the
 * create_age_brackets_table migration already inserts these same defaults
 * on a fresh install -- running `php artisan db:seed` won't duplicate rows.
 */
class AgeBracketSeeder extends Seeder
{
    public function run(): void
    {
        $brackets = [
            ['label' => 'Child',          'min_age' => 0,  'max_age' => 12,   'sort_order' => 1],
            ['label' => 'Youth',          'min_age' => 13, 'max_age' => 17,   'sort_order' => 2],
            ['label' => 'Adult',          'min_age' => 18, 'max_age' => 59,   'sort_order' => 3],
            ['label' => 'Senior Citizen', 'min_age' => 60, 'max_age' => null, 'sort_order' => 4],
        ];

        foreach ($brackets as $bracket) {
            AgeBracket::updateOrCreate(['label' => $bracket['label']], $bracket);
        }
    }
}

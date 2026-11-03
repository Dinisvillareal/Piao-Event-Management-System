<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Keeps every row's total `quantity` equal to the sum of its four condition
 * counts (new + good + fair + poor), enforced by the database itself.
 *
 * Step 1 repairs rows that predate the split (counts all 0, or short of the
 * total): the missing units are put into the item's main condition, exactly
 * how the application already reads them. If a row's counts ever exceeded its
 * total, the total is raised to match the counts.
 * Step 2 adds a CHECK constraint per table so it can't drift again.
 */
return new class extends Migration
{
    private const TABLES = [
        'inventory_items' => 'inventory_items_units_sum_chk',
        'event_inventory_items' => 'event_inventory_items_units_sum_chk',
        'event_inventory_releases' => 'event_inventory_releases_units_sum_chk',
    ];

    private const COLS = ['new_quantity', 'good_quantity', 'fair_quantity', 'poor_quantity'];

    /** Column holding the most units (ties go to the worse condition); Good when empty. */
    private function mainColumn(array $counts): string
    {
        if (array_sum($counts) <= 0) {
            return 'good_quantity';
        }
        $best = null;
        foreach (['poor_quantity', 'fair_quantity', 'good_quantity', 'new_quantity'] as $col) {
            if ($best === null || $counts[$col] > $counts[$best]) {
                $best = $col;
            }
        }

        return $best;
    }

    public function up(): void
    {
        $sum = implode(' + ', self::COLS);
        $itemCounts = [];
        foreach (DB::table('inventory_items')->get(['id', ...self::COLS]) as $i) {
            $itemCounts[$i->id] = array_map(fn ($c) => (int) $i->{$c}, array_combine(self::COLS, self::COLS));
        }

        foreach (array_keys(self::TABLES) as $table) {
            DB::table($table)
                ->whereRaw("quantity <> ({$sum})")
                ->orderBy('id')
                ->get(['id', 'quantity', ...self::COLS, ...($table === 'inventory_items' ? [] : ['inventory_item_id'])])
                ->each(function ($row) use ($table, $itemCounts) {
                    $counts = array_map(fn ($c) => (int) $row->{$c}, array_combine(self::COLS, self::COLS));
                    $rest = (int) $row->quantity - array_sum($counts);

                    if ($rest > 0) {
                        $own = $table === 'inventory_items' ? $counts : ($itemCounts[$row->inventory_item_id] ?? $counts);
                        $counts[$this->mainColumn($own)] += $rest;
                    }
                    // rest < 0: the counts are the truth, so the total follows them.

                    DB::table($table)->where('id', $row->id)->update($counts + ['quantity' => array_sum($counts)]);
                });
        }

        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return; // SQLite (tests) can't add a CHECK to an existing table.
        }

        foreach (self::TABLES as $table => $name) {
            DB::statement("ALTER TABLE `{$table}` ADD CONSTRAINT `{$name}` CHECK (`quantity` = `new_quantity` + `good_quantity` + `fair_quantity` + `poor_quantity`)");
        }
    }

    public function down(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        foreach (self::TABLES as $table => $name) {
            try {
                DB::statement("ALTER TABLE `{$table}` DROP CONSTRAINT `{$name}`");
            } catch (\Throwable $e) {
                DB::statement("ALTER TABLE `{$table}` DROP CHECK `{$name}`"); // older MySQL syntax
            }
        }
    }
};

<?php

namespace Database\Seeders;

use App\Models\InventoryItem;
use Illuminate\Database\Seeder;

class InventoryConditionSeeder extends Seeder
{
    /**
     * Splits the in-stock units of the demo inventory across conditions, so
     * one item can hold e.g. 450 Good + 150 New chairs instead of needing a
     * duplicate row per condition.
     *
     * Weights are [New, Good, Fair, Poor]; they are scaled to whatever is
     * currently in stock (largest-remainder rounding), so the item's total
     * `quantity` never changes -- loans and returns recorded by the event
     * seeders stay valid. Items not listed keep all their stock in their
     * single condition.
     *
     * Safe to run on its own (php artisan db:seed --class=InventoryConditionSeeder)
     * on an existing database: an item is only split while all of its stock
     * is still in one condition, so a split staff already edited is never
     * overwritten, and running it twice changes nothing.
     */
    private const SPLITS = [
        'Plastic Monobloc Chairs'              => [150, 450, 50, 0],  // 3 Good : 1 New, a few worn
        'Folding Tables (6ft)'                 => [10, 30, 10, 0],
        'Event Canopy Tent (10x10)'            => [4, 12, 2, 0],
        'First Aid Kit (Complete)'             => [5, 1, 0, 0],
        'Digital Blood Pressure Monitor'       => [3, 7, 0, 0],
        'Wireless Microphone Set'              => [0, 3, 5, 0],
        'LCD Projector'                        => [0, 2, 3, 0],
        'Rice Cooker (Industrial, 10L)'        => [1, 3, 1, 0],
        'Food Trays (Stainless)'               => [0, 30, 24, 5],
        'Megaphone (Handheld)'                 => [4, 8, 2, 0],
        'Rescue Rope (30m)'                    => [4, 8, 0, 0],
        'Wheelchairs (Standard)'               => [1, 2, 1, 0],
        'Extension Cords (Heavy Duty, 20m)'    => [6, 14, 4, 0],
        'Yoga Mats (Set of 10)'                => [3, 7, 0, 0],
        'Adjustable Crutches (Pair)'           => [4, 12, 2, 0],
        'Walking Canes'                        => [20, 5, 0, 0],
        'Sewing Machines (Manual)'             => [0, 3, 5, 2],
        'Display Tables (Foldable)'            => [8, 24, 8, 0],
        'Trash Bins (Segregated, 3-in-1)'      => [0, 4, 8, 10],
    ];

    public function run(): void
    {
        $columns = array_values(InventoryItem::CONDITION_COLUMNS);

        foreach (self::SPLITS as $name => $weights) {
            $item = InventoryItem::where('name', $name)->first();
            if (! $item || $item->quantity <= 0) {
                continue;
            }

            // Already split (or edited by staff) -- leave it alone.
            $used = collect($columns)->filter(fn ($c) => (int) $item->{$c} > 0)->count();
            if ($used > 1) {
                continue;
            }

            $counts = $this->scale($weights, (int) $item->quantity);
            $item->fill(array_combine($columns, $counts));
            $item->save();
        }
    }

    /** Scales $weights so they add up to exactly $total (largest-remainder rounding). */
    private function scale(array $weights, int $total): array
    {
        $sum = array_sum($weights);
        $shares = array_map(fn ($w) => $w * $total / $sum, $weights);
        $counts = array_map('intval', $shares);

        $left = $total - array_sum($counts);
        $remainders = [];
        foreach ($shares as $i => $share) {
            $remainders[$i] = $share - $counts[$i];
        }
        arsort($remainders);
        foreach (array_keys($remainders) as $i) {
            if ($left <= 0) {
                break;
            }
            $counts[$i]++;
            $left--;
        }

        return $counts;
    }
}

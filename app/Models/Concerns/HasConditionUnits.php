<?php

namespace App\Models\Concerns;

use App\Models\InventoryItem;

/**
 * For rows that move a number of inventory units around (an event's borrow
 * row, a release of it): remembers how many of those units are New / Good /
 * Fair / Poor, so they go back into the same conditions they came out of.
 *
 * `quantity` stays the total. Rows made before units were split have all four
 * counts at 0 -- the "unsplit" remainder (quantity minus the split units) is
 * treated as belonging to the item's main condition.
 */
trait HasConditionUnits
{
    public static function unitColumns(): array
    {
        return InventoryItem::CONDITION_COLUMNS;
    }

    public function initializeHasConditionUnits(): void
    {
        $this->mergeFillable(array_values(InventoryItem::CONDITION_COLUMNS));
        foreach (InventoryItem::CONDITION_COLUMNS as $col) {
            $this->casts[$col] = 'integer';
        }
    }

    /** Units per condition; unsplit units are counted under $main. Always adds up to `quantity`. */
    public function resolvedUnits(string $main = 'Good'): array
    {
        $units = [];
        foreach (InventoryItem::CONDITION_COLUMNS as $label => $col) {
            $units[$label] = (int) $this->getAttribute($col);
        }
        $rest = (int) $this->quantity - array_sum($units);
        if ($rest > 0) {
            $units[isset($units[$main]) ? $main : 'Good'] += $rest;
        }

        return $units;
    }

    /** Replaces the split and the total quantity with $units. Does not save. */
    public function setUnits(array $units): void
    {
        foreach (InventoryItem::CONDITION_COLUMNS as $label => $col) {
            $this->setAttribute($col, max(0, (int) ($units[$label] ?? 0)));
        }
        $this->quantity = array_sum(array_map(fn ($n) => max(0, (int) $n), $units));
    }

    /** Adds $units to this row. Does not save. */
    public function addUnits(array $units, string $main = 'Good'): void
    {
        $now = $this->resolvedUnits($main);
        foreach ($units as $label => $n) {
            $now[$label] = ($now[$label] ?? 0) + (int) $n;
        }
        $this->setUnits($now);
    }

    /**
     * Takes out as many units as were returned, preferring the same
     * conditions they were borrowed in; whatever is left over (a unit came
     * back in a different condition than it left in) comes from the largest
     * remaining condition. Does not save.
     */
    public function takeOutMatching(array $returned, string $main = 'Good'): void
    {
        $now = $this->resolvedUnits($main);
        $left = 0;
        foreach ($returned as $label => $n) {
            $n = max(0, (int) $n);
            $cut = min($n, $now[$label] ?? 0);
            if ($cut > 0) {
                $now[$label] -= $cut;
            }
            $left += $n - $cut;
        }

        arsort($now);
        foreach (array_keys($now) as $label) {
            if ($left <= 0) {
                break;
            }
            $cut = min($left, $now[$label]);
            $now[$label] -= $cut;
            $left -= $cut;
        }

        $this->setUnits($now);
    }

    /**
     * Takes $n units out of this row (largest condition first) and returns
     * what was taken, per condition. Does not save.
     */
    public function takeOutUnits(int $n, string $main = 'Good'): array
    {
        $now = $this->resolvedUnits($main);
        $taken = array_fill_keys(array_keys($now), 0);

        $order = array_keys($now);
        usort($order, fn ($a, $b) => $now[$b] <=> $now[$a]);
        foreach ($order as $label) {
            if ($n <= 0) {
                break;
            }
            $cut = min($n, $now[$label]);
            $taken[$label] = $cut;
            $now[$label] -= $cut;
            $n -= $cut;
        }

        $this->setUnits($now);

        return $taken;
    }
}

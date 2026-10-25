<?php

namespace Database\Seeders;

use App\Models\EventInventoryItem;
use App\Models\InventoryItem;
use Illuminate\Database\Seeder;

class EventInventoryConditionSeeder extends Seeder
{
    /**
     * Gives the event loans that are already in the database a per-condition
     * split, WITHOUT touching anything else (no fresh seed needed):
     *
     *   php artisan migrate
     *   php artisan db:seed --class=InventoryConditionSeeder
     *   php artisan db:seed --class=EventInventoryConditionSeeder
     *
     * A loan made before units were split has no split on its row, and its
     * units were taken out of the item's main condition. Here staff-style
     * choices are applied instead: regular (Good) stock goes out first, then
     * New, Fair and Poor. The item's in-stock counts are adjusted by exactly
     * the difference, so every item's total (in stock + on loan) per
     * condition is unchanged. A loan is skipped if the stock can't cover the
     * change, and loans that already have a split are never touched, so
     * running this twice does nothing.
     */
    public function run(): void
    {
        $order = ['Good', 'New', 'Fair', 'Poor'];

        $unsplit = EventInventoryItem::all()->filter(fn ($b) => array_sum(array_map(
            fn ($col) => (int) $b->{$col},
            InventoryItem::CONDITION_COLUMNS
        )) === 0);

        foreach ($unsplit as $borrow) {
            $item = InventoryItem::find($borrow->inventory_item_id);
            if (! $item || $borrow->quantity <= 0) {
                continue;
            }

            // Units still sitting in stock plus this loan's units, as the
            // loan was originally counted (all of it from the main condition).
            $stock = $item->conditionCounts();
            $implied = array_fill_keys(array_keys($stock), 0);
            $implied[$item->condition] = (int) $borrow->quantity;

            $pool = $stock;
            $pool[$item->condition] += (int) $borrow->quantity;

            $want = array_fill_keys(array_keys($stock), 0);
            $left = (int) $borrow->quantity;
            foreach ($order as $label) {
                $take = min($left, $pool[$label]);
                $want[$label] = $take;
                $left -= $take;
            }
            if ($left > 0) {
                continue;
            }

            // Stock after the change = pool - want; skip if that would be negative.
            $newStock = [];
            foreach ($stock as $label => $n) {
                $newStock[$label] = $n + $implied[$label] - $want[$label];
                if ($newStock[$label] < 0) {
                    continue 2;
                }
            }

            foreach (InventoryItem::CONDITION_COLUMNS as $label => $col) {
                $item->{$col} = $newStock[$label];
            }
            $item->save();

            $borrow->setUnits($want);
            $borrow->save();
        }
    }
}

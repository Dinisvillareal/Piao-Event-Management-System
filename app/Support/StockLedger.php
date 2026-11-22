<?php

namespace App\Support;

use App\Models\InventoryItem;
use App\Models\InventoryUnitLog;
use Illuminate\Support\Facades\DB;

/**
 * Reconciliation of an item's stock against its ledger (inventory_unit_logs). Two identities must hold
 * for every item, archived ones included:
 *
 *   lost units    lost_quantity  =  units reported lost  -  units found (found reports that were not undone)
 *   all units     in stock + on loan + lost  =  units added  +  net stock adjustments
 *
 * (Units move between stock, a loan and "lost" without changing the total; only an item being added or
 * its stock being adjusted changes how many units the barangay owns.) A difference means a stock number
 * or a ledger entry was changed outside the app. Items that existed before the ledger do not reconcile
 * until their opening balance is written down: adopt() records each difference as an explicit entry
 * (user SYSTEM) instead of hiding it.
 */
class StockLedger
{
    /** @return array<int,array<string,mixed>> one row per item that does not reconcile */
    public static function check(): array
    {
        $added = $adjusted = $lost = $found = $hasAdded = [];

        DB::table('inventory_unit_logs')->orderBy('id')->select(['id', 'inventory_item_id', 'action', 'quantity', 'units', 'undone_at'])
            ->chunkById(1000, function ($chunk) use (&$added, &$adjusted, &$lost, &$found, &$hasAdded) {
                foreach ($chunk as $l) {
                    $i = (int) $l->inventory_item_id;
                    $q = (int) $l->quantity;
                    match ($l->action) {
                        'added' => [$added[$i] = ($added[$i] ?? 0) + $q, $hasAdded[$i] = true],
                        'adjusted' => $adjusted[$i] = ($adjusted[$i] ?? 0) + array_sum(array_map('intval', (array) json_decode((string) $l->units, true))),
                        'lost' => $lost[$i] = ($lost[$i] ?? 0) + $q,
                        'found' => $l->undone_at === null ? $found[$i] = ($found[$i] ?? 0) + $q : null,
                        default => null,
                    };
                }
            });

        $onLoan = DB::table('event_inventory_items')->selectRaw('inventory_item_id, SUM(quantity) AS q')->groupBy('inventory_item_id')->pluck('q', 'inventory_item_id');

        $problems = [];
        foreach (DB::table('inventory_items')->orderBy('id')->get(['id', 'name', 'quantity', 'lost_quantity']) as $item) {
            $i = (int) $item->id;
            $loan = (int) ($onLoan[$i] ?? 0);
            $owned = (int) $item->quantity + $loan + (int) $item->lost_quantity;
            $expectedOwned = ($added[$i] ?? 0) + ($adjusted[$i] ?? 0);
            $expectedLost = ($lost[$i] ?? 0) - ($found[$i] ?? 0);

            $ownedGap = $owned - $expectedOwned;
            $lostGap = (int) $item->lost_quantity - $expectedLost;

            if ($ownedGap !== 0 || $lostGap !== 0) {
                $problems[] = [
                    'id' => $i, 'name' => (string) $item->name, 'stock' => (int) $item->quantity, 'on_loan' => $loan, 'lost' => (int) $item->lost_quantity,
                    'owned' => $owned, 'expected_owned' => $expectedOwned, 'expected_lost' => $expectedLost,
                    'owned_gap' => $ownedGap, 'lost_gap' => $lostGap, 'has_added' => isset($hasAdded[$i]),
                ];
            }
        }

        return $problems;
    }

    /**
     * Writes each difference down as an explicit ledger entry (user SYSTEM), so the ledger agrees with the
     * stock again and the difference stays visible in the history. Returns how many entries were written.
     */
    public static function adopt(): int
    {
        $written = 0;

        foreach (self::check() as $p) {
            DB::transaction(function () use ($p, &$written) {
                $item = InventoryItem::withTrashed()->find($p['id']);
                $main = $item?->condition ?? 'Good';
                $entry = fn (string $action, int $units) => InventoryUnitLog::create([
                    'inventory_item_id' => $p['id'], 'event_id' => null, 'action' => $action,
                    'quantity' => abs($units), 'units' => [$main => $units], 'user_code' => 'SYSTEM',
                ]);

                if ($p['owned_gap'] !== 0) {
                    $entry($p['owned_gap'] > 0 && !$p['has_added'] ? 'added' : 'adjusted', $p['owned_gap']);
                    $written++;
                }
                if ($p['lost_gap'] > 0) {
                    $entry('lost', $p['lost_gap']);
                    $written++;
                } elseif ($p['lost_gap'] < 0) {
                    $entry('found', -$p['lost_gap']);
                    $written++;
                }
            });
        }

        return $written;
    }
}

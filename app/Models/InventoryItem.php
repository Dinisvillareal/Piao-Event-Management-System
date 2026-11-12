<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class InventoryItem extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'quantity',
        'storage_location',
        'notes',
        'photo_path',
        'deleted_by',
        'lost_quantity',
        'new_quantity',
        'good_quantity',
        'fair_quantity',
        'poor_quantity',
    ];

    /**
     * In-stock units are split by condition: an item can hold 45 Good and
     * 15 New at once. The four counts always add up to `quantity`. There is no
     * stored `condition` column: the item's main (largest) condition, for the
     * places that only need one label, is worked out from the counts by the
     * `condition` accessor below.
     */
    public const CONDITION_COLUMNS = [
        'New' => 'new_quantity',
        'Good' => 'good_quantity',
        'Fair' => 'fair_quantity',
        'Poor' => 'poor_quantity',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'new_quantity' => 'integer',
        'good_quantity' => 'integer',
        'fair_quantity' => 'integer',
        'poor_quantity' => 'integer',
        'lost_quantity' => 'integer',
    ];

    // Same convention as User::validation_id_url and
    // EventExpense::receipt_url -- the stored path is an internal
    // storage/app/public detail, the frontend only ever needs the public
    // URL, so it's appended automatically on every JSON response.
    protected $appends = [
        'photo_url',
        'condition',
    ];

    protected static function booted(): void
    {
        // Keeps `quantity`, the per-condition counts and `condition` in step
        // no matter who changes stock (the inventory form, event loans and
        // returns, lost units):
        //  - the form sends the per-condition counts -> quantity = their sum;
        //  - anything else changes only `quantity` -> the counts follow it:
        //    units leave the main condition first (then the largest groups)
        //    and returned units go back into the main condition.
        static::saving(function (InventoryItem $item) {
            $columns = array_values(self::CONDITION_COLUMNS);
            $counts = [];
            foreach ($columns as $col) {
                $counts[$col] = max(0, (int) $item->getAttribute($col));
            }

            $countsEdited = $item->isDirty($columns);
            $quantityEdited = $item->isDirty('quantity') || ! $item->exists;
            $quantity = max(0, (int) $item->getAttribute('quantity'));

            if ($countsEdited && ! $item->isDirty('quantity')) {
                $quantity = array_sum($counts);
            } elseif ($quantityEdited || $countsEdited) {
                $main = self::mainColumn($counts, 'Good');
                $delta = $quantity - array_sum($counts);

                if ($delta > 0) {
                    $counts[$main] += $delta;
                } elseif ($delta < 0) {
                    $take = -$delta;
                    $order = $columns;
                    usort($order, fn ($a, $b) => ($b === $main) <=> ($a === $main) ?: $counts[$b] <=> $counts[$a]);
                    foreach ($order as $col) {
                        $cut = min($take, $counts[$col]);
                        $counts[$col] -= $cut;
                        $take -= $cut;
                        if ($take <= 0) {
                            break;
                        }
                    }
                }
            }

            foreach ($counts as $col => $n) {
                $item->setAttribute($col, $n);
            }
            $item->setAttribute('quantity', $quantity);

        });
    }

    /** The condition column holding the most units (ties go to the worse condition). */
    private static function mainColumn(array $counts, ?string $fallback): string
    {
        if (array_sum($counts) <= 0) {
            return self::CONDITION_COLUMNS[$fallback] ?? 'good_quantity';
        }

        $best = null;
        foreach (['poor_quantity', 'fair_quantity', 'good_quantity', 'new_quantity'] as $col) {
            if ($best === null || $counts[$col] > $counts[$best]) {
                $best = $col;
            }
        }

        return $best;
    }

    /**
     * The item's main condition: the one holding the most in-stock units (ties go to
     * the worse condition). Derived from the counts, never stored; an item with no
     * units in stock reads as Good.
     */
    public function getConditionAttribute(): string
    {
        $counts = [];
        foreach (self::CONDITION_COLUMNS as $col) {
            $counts[$col] = max(0, (int) $this->getAttribute($col));
        }

        return array_flip(self::CONDITION_COLUMNS)[self::mainColumn($counts, 'Good')];
    }

    /** In-stock units per condition, e.g. ['New' => 15, 'Good' => 45, 'Fair' => 0, 'Poor' => 0]. */
    public function conditionCounts(): array
    {
        $out = [];
        foreach (self::CONDITION_COLUMNS as $label => $col) {
            $out[$label] = (int) $this->getAttribute($col);
        }

        return $out;
    }

    /** Puts units back into stock, into exactly the conditions given. */
    public function giveUnits(array $units): void
    {
        $this->moveUnits($units, +1);
    }

    /**
     * Takes units out of stock, out of exactly the conditions given. Callers
     * check availableUnits() first; counts never go below 0.
     */
    public function takeUnits(array $units): void
    {
        $this->moveUnits($units, -1);
    }

    /** Which of the wanted units this item can't cover right now, e.g. ['Good' => 3]. */
    public function shortfall(array $units): array
    {
        $have = $this->conditionCounts();
        $short = [];
        foreach ($units as $label => $n) {
            if ((int) $n > ($have[$label] ?? 0)) {
                $short[$label] = (int) $n - ($have[$label] ?? 0);
            }
        }

        return $short;
    }

    private function moveUnits(array $units, int $sign): void
    {
        $total = 0;
        foreach (self::CONDITION_COLUMNS as $label => $col) {
            $n = max(0, (int) ($units[$label] ?? 0));
            if ($n === 0) {
                continue;
            }
            $this->{$col} = max(0, (int) $this->{$col} + $sign * $n);
            $total += $n;
        }
        $this->quantity = max(0, (int) $this->quantity + $sign * $total);
        $this->save();
    }

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path
            ? Storage::disk('public')->url($this->photo_path)
            : null;
    }

    // Outstanding "borrowed for an event" rows -- see EventInventoryItem.
    // A row here is deleted (and the quantity restored) once its event is
    // archived, so "has any rows" == "currently lent out to a live event".
    public function borrows()
    {
        return $this->hasMany(EventInventoryItem::class, 'inventory_item_id');
    }

    // A loss is a fact recorded once, per event, when staff counted what did not come back
    // (inventory_unit_logs, action "lost"). Units that turn up later cannot be tied to an
    // event -- a photo of a chair looks the same for every event -- so recoveries are never
    // subtracted from an event's loss. They live on the item: recoveredTotal() and
    // lost_quantity (the units still missing).

    /** Units found again so far (found reports that were not undone), all events together. */
    public function recoveredTotal(): int
    {
        return (int) InventoryUnitLog::where('inventory_item_id', $this->id)
            ->where('action', 'found')->whereNull('undone_at')->sum('quantity');
    }

    /**
     * The units still recorded as lost, per condition, e.g.
     * ['New' => 0, 'Good' => 14, 'Fair' => 0, 'Poor' => 0]. They always add up to
     * lost_quantity.
     *
     * Units come back in the condition they went missing in, so a lost unit
     * can only be found in that same condition. The breakdown is worked out from
     * the item's lost / found history (inventory_unit_logs): what was lost per
     * condition minus what was already found per condition. Older records the
     * history cannot fully account for are squared with lost_quantity: anything
     * left over is counted under the item's main condition, and any excess is
     * taken off the largest group first.
     */
    public function lostByCondition(): array
    {
        $labels = array_keys(self::CONDITION_COLUMNS);
        $net = array_fill_keys($labels, 0);

        $logs = InventoryUnitLog::where('inventory_item_id', $this->id)
            ->whereIn('action', ['lost', 'found'])
            ->whereNull('undone_at') // a found entry that was undone no longer counts
            ->get(['action', 'units']);
        foreach ($logs as $log) {
            $sign = $log->action === 'lost' ? 1 : -1;
            foreach ($labels as $label) {
                $net[$label] += $sign * (int) ($log->units[$label] ?? 0);
            }
        }

        // Units found in a different condition than they were lost in (older entries)
        // are taken off the other groups.
        $excessFound = 0;
        foreach ($net as $label => $n) {
            if ($n < 0) {
                $excessFound += -$n;
                $net[$label] = 0;
            }
        }
        $shrink = function (int $by) use (&$net) {
            while ($by > 0 && array_sum($net) > 0) {
                $largest = array_keys($net, max($net))[0];
                $net[$largest]--;
                $by--;
            }
        };
        $shrink($excessFound);

        $target = max(0, (int) $this->lost_quantity);
        $diff = $target - array_sum($net);
        if ($diff > 0) {
            $net[$this->condition] += $diff;
        } elseif ($diff < 0) {
            $shrink(-$diff);
        }

        return $net;
    }
}

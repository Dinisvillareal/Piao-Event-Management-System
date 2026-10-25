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
        'condition',
        'storage_location',
        'notes',
        'photo_path',
        'extra_photo_paths',
        'deleted_by',
        'lost_quantity',
        'lost_pending',
        'disposed_quantity',
        'new_quantity',
        'good_quantity',
        'fair_quantity',
        'poor_quantity',
    ];

    /**
     * In-stock units are split by condition: an item can hold 45 Good and
     * 15 New at once. The four counts always add up to `quantity`; the old
     * single `condition` column is kept as the item's main (largest)
     * condition so filters and reports that only need one label still work.
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
        'lost_pending' => 'integer',
        'disposed_quantity' => 'integer',
        'extra_photo_paths' => 'array',
    ];

    // Same convention as User::validation_id_url and
    // EventExpense::receipt_url -- the stored path is an internal
    // storage/app/public detail, the frontend only ever needs the public
    // URL, so it's appended automatically on every JSON response.
    protected $appends = [
        'photo_url',
        'photo_urls',
    ];

    protected static function booted(): void
    {
        // Keeps `quantity`, the per-condition counts and `condition` in step
        // no matter who changes stock (the inventory form, event loans and
        // returns, lost / disposed units):
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
                $main = $countsEdited
                    ? self::mainColumn($counts, $item->condition)
                    : (self::CONDITION_COLUMNS[$item->condition] ?? 'good_quantity');
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

            // The main condition is re-picked only when the counts themselves
            // were edited; a loan or return keeps it, so returned units go
            // back to where they came from.
            if ($countsEdited) {
                $flip = array_flip(self::CONDITION_COLUMNS);
                if (array_sum($counts) > 0) {
                    $item->setAttribute('condition', $flip[self::mainColumn($counts, $item->condition)]);
                }
            }
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

    /** Every photo path, cover first (photo_path, then the extras). */
    public function allPhotoPaths(): array
    {
        return array_values(array_filter(array_merge([$this->photo_path], $this->extra_photo_paths ?? [])));
    }

    /** Public URLs of every photo, cover first. */
    public function getPhotoUrlsAttribute(): array
    {
        return array_map(fn ($p) => Storage::disk('public')->url($p), $this->allPhotoPaths());
    }

    // Outstanding "borrowed for an event" rows -- see EventInventoryItem.
    // A row here is deleted (and the quantity restored) once its event is
    // archived, so "has any rows" == "currently lent out to a live event".
    public function borrows()
    {
        return $this->hasMany(EventInventoryItem::class, 'inventory_item_id');
    }

    /**
     * Lost units are tracked on the item itself, separate from its condition:
     *  - lost_quantity: every unit reported lost (shown as "N lost").
     *  - lost_pending:  the part of those that were still out on loan when
     *    reported, so they couldn't be taken out of stock yet.
     * In-stock `quantity` never includes lost units, so the units that are
     * still good keep their condition untouched.
     *
     * This settles the pending part once it is knowable: when everything still
     * out on loan is lost (nothing real left to return), that loan is cleared
     * instead of lingering in Pending Returns forever. If more is out than was
     * reported lost, nothing is touched -- there is no telling which loan lost
     * the unit, so the loans stay until the rest comes back. Any lost units
     * that were mistakenly returned to stock are taken back out of stock.
     */
    public function settleLostOnLoan(): void
    {
        if ($this->lost_pending <= 0) {
            return;
        }

        $out = (int) $this->borrows()->sum('quantity');
        if ($out > $this->lost_pending) {
            return;
        }

        $this->borrows()->delete();

        $leftover = $this->lost_pending - $out;
        $fromStock = min($leftover, (int) $this->quantity);
        $this->quantity -= $fromStock;
        $this->lost_pending = $leftover - $fromStock;
        $this->save();
    }
}
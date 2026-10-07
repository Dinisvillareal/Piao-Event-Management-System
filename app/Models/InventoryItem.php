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
    ];

    protected $casts = [
        'quantity' => 'integer',
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
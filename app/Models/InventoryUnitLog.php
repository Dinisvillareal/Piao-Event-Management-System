<?php

namespace App\Models;

use App\Models\Concerns\JoinsHashChain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * One entry of an inventory item's ledger (added, adjusted, lost, found).
 * Written once and never edited or deleted (migration 2026_11_19_000021); the only change a row may
 * ever get is its undo marker, set once. Part of a hash chain, so an edit, a removal or a planted
 * entry is named by `php artisan log:verify`.
 *
 * A lost / found report on an inventory item.
 * `event_id` is set for units lost while out on an event's loan, and for a found
 * report when staff named the event the units came back from.
 */
class InventoryUnitLog extends Model
{
    use JoinsHashChain;

    /** The chain fingerprints are for verification only; they never leave the server in a response. */
    protected $hidden = ['prev_hash', 'row_hash'];

    protected $fillable = [
        'inventory_item_id',
        'event_id',
        'action',
        'quantity',
        'units',
        'photo_path',
        'extra_photo_paths',
        'user_code',
        'undone_at',
        'undone_by',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'units' => 'array',
        'extra_photo_paths' => 'array',
        'undone_at' => 'datetime',
    ];

    protected $appends = ['photo_url', 'photo_urls'];

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path ? Storage::disk('public')->url($this->photo_path) : null;
    }

    /** Public URLs of every evidence photo, cover first. */
    public function getPhotoUrlsAttribute(): array
    {
        return array_map(
            fn ($p) => Storage::disk('public')->url($p),
            array_values(array_filter(array_merge([$this->photo_path], $this->extra_photo_paths ?? [])))
        );
    }
}

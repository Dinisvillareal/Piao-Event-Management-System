<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * A lost / found report on an inventory item.
 * `event_id` is set for units lost while out on an event's loan, and for a found
 * report when staff named the event the units came back from.
 */
class InventoryUnitLog extends Model
{
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

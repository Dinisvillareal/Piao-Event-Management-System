<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * A lost / found / disposed / restored report on an inventory item.
 * `event_id` is set only for units lost while out on an event's loan.
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
    ];

    protected $casts = [
        'quantity' => 'integer',
        'units' => 'array',
        'extra_photo_paths' => 'array',
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

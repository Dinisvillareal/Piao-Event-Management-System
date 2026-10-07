<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EventInventoryRelease extends Model
{
    protected $fillable = [
        'event_id',
        'inventory_item_id',
        'quantity',
        'released_by',
        'undone_at',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'undone_at' => 'datetime',
    ];

    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    public function inventoryItem()
    {
        // withTrashed -- a release made before an item was later
        // soft-deleted should still show what it was, not go null.
        return $this->belongsTo(InventoryItem::class)->withTrashed();
    }
}

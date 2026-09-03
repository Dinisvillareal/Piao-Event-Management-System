<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EventInventoryItem extends Model
{
    protected $fillable = [
        'event_id',
        'inventory_item_id',
        'quantity',
    ];

    protected $casts = [
        'quantity' => 'integer',
    ];

    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    public function inventoryItem()
    {
        // withTrashed -- a borrow record made before an item was later
        // soft-deleted should still show what it was, not go null.
        return $this->belongsTo(InventoryItem::class)->withTrashed();
    }
}

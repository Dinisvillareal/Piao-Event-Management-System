<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class InventoryItem extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'quantity',
        'condition',
        'storage_location',
        'notes',
        'deleted_by',
    ];

    protected $casts = [
        'quantity' => 'integer',
    ];

    // Outstanding "borrowed for an event" rows -- see EventInventoryItem.
    // A row here is deleted (and the quantity restored) once its event is
    // archived, so "has any rows" == "currently lent out to a live event".
    public function borrows()
    {
        return $this->hasMany(EventInventoryItem::class, 'inventory_item_id');
    }
}

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
        'deleted_by',
    ];

    protected $casts = [
        'quantity' => 'integer',
    ];

    // Same convention as User::validation_id_url and
    // EventExpense::receipt_url -- the stored path is an internal
    // storage/app/public detail, the frontend only ever needs the public
    // URL, so it's appended automatically on every JSON response.
    protected $appends = [
        'photo_url',
    ];

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
}
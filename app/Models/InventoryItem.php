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
}

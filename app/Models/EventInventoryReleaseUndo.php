<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EventInventoryReleaseUndo extends Model
{
    protected $fillable = [
        'event_inventory_release_id',
        'quantity',
        'undone_by',
    ];

    protected $casts = [
        'quantity' => 'integer',
    ];

    public function release()
    {
        // withTrashed-equivalent isn't needed here -- releases are never
        // soft-deleted, only marked undone_at -- but the release itself may
        // point at a since-soft-deleted event or inventory item, which is
        // why those two relations are still loaded withTrashed() below.
        return $this->belongsTo(EventInventoryRelease::class, 'event_inventory_release_id');
    }
}

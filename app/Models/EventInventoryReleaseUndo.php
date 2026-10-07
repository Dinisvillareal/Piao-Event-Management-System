<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class EventInventoryReleaseUndo extends Model
{
    protected $fillable = [
        'event_inventory_release_id',
        'quantity',
        'undone_by',
        'photo_path',
    ];

    protected $casts = [
        'quantity' => 'integer',
    ];

    // Same convention as EventInventoryRelease::evidence_photo_url -- the
    // stored path is an internal storage/app/public detail, the frontend
    // only ever needs the public URL.
    protected $appends = [
        'photo_url',
    ];

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path
            ? Storage::disk('public')->url($this->photo_path)
            : null;
    }

    public function release()
    {
        // withTrashed-equivalent isn't needed here -- releases are never
        // soft-deleted, only marked undone_at -- but the release itself may
        // point at a since-soft-deleted event or inventory item, which is
        // why those two relations are still loaded withTrashed() below.
        return $this->belongsTo(EventInventoryRelease::class, 'event_inventory_release_id');
    }
}

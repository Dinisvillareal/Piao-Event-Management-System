<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class EventInventoryRelease extends Model
{
    protected $fillable = [
        'event_id',
        'inventory_item_id',
        'quantity',
        'released_by',
        'undone_at',
        'evidence_photo_path',
        'extra_evidence_photo_paths',
        'undo_photo_path',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'undone_at' => 'datetime',
        'extra_evidence_photo_paths' => 'array',
    ];

    // Same convention as InventoryItem::photo_url -- the stored path is an
    // internal storage/app/public detail, the frontend only ever needs the
    // public URL, so both are appended automatically on every JSON response.
    protected $appends = [
        'evidence_photo_url',
        'evidence_photo_urls',
        'undo_photo_url',
    ];

    public function getEvidencePhotoUrlAttribute(): ?string
    {
        return $this->evidence_photo_path
            ? Storage::disk('public')->url($this->evidence_photo_path)
            : null;
    }

    /** Every evidence photo path, cover first. */
    public function allEvidencePhotoPaths(): array
    {
        return array_values(array_filter(array_merge([$this->evidence_photo_path], $this->extra_evidence_photo_paths ?? [])));
    }

    /** Public URLs of every evidence photo, cover first. */
    public function getEvidencePhotoUrlsAttribute(): array
    {
        return array_map(fn ($p) => Storage::disk('public')->url($p), $this->allEvidencePhotoPaths());
    }

    public function getUndoPhotoUrlAttribute(): ?string
    {
        return $this->undo_photo_path
            ? Storage::disk('public')->url($this->undo_photo_path)
            : null;
    }

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

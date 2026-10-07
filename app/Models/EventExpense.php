<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class EventExpense extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'event_id',
        'item',
        'amount',
        'notes',
        'receipt_path',
        'extra_receipt_paths',
        'recorded_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'extra_receipt_paths' => 'array',
    ];

    // Same convention as User::validation_id_url -- the stored path is an
    // internal storage/app/public detail, the frontend only ever needs the
    // public URL, so it's appended automatically on every JSON response.
    protected $appends = [
        'receipt_url',
        'receipt_urls',
    ];

    public function getReceiptUrlAttribute(): ?string
    {
        return $this->receipt_path
            ? Storage::disk('public')->url($this->receipt_path)
            : null;
    }

    /** Every receipt file path, first one first (receipt_path, then the extras). */
    public function allReceiptPaths(): array
    {
        return array_values(array_filter(array_merge([$this->receipt_path], $this->extra_receipt_paths ?? [])));
    }

    /** Public URLs of every receipt file, first one first. */
    public function getReceiptUrlsAttribute(): array
    {
        return array_map(fn ($p) => Storage::disk('public')->url($p), $this->allReceiptPaths());
    }

    public function event()
    {
        return $this->belongsTo(Event::class);
    }
}

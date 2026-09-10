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
        'recorded_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    // Same convention as User::validation_id_url -- the stored path is an
    // internal storage/app/public detail, the frontend only ever needs the
    // public URL, so it's appended automatically on every JSON response.
    protected $appends = [
        'receipt_url',
    ];

    public function getReceiptUrlAttribute(): ?string
    {
        return $this->receipt_path
            ? Storage::disk('public')->url($this->receipt_path)
            : null;
    }

    public function event()
    {
        return $this->belongsTo(Event::class);
    }
}

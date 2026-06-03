<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $fillable = [
        'user_id',
        'event_id',
        'type',
        'title',
        'message',
        'is_updated',
        'updated_at_notification',
        'read',
    ];

    protected $casts = [
        'read' => 'boolean',
        'is_updated' => 'boolean',
        'updated_at_notification' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function event()
    {
        return $this->belongsTo(Event::class);
    }
}
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Feedback extends Model
{
    protected $table = 'feedback';

    protected $fillable = [
        'event_id',
        'user_id',
        'rating',
        'comment',
    ];

    protected $casts = [
        'staff_liked_at' => 'datetime',
        'staff_replied_at' => 'datetime',
        'member_liked_reply_at' => 'datetime',
    ];

    public function event()
    {
        return $this->belongsTo(Event::class)->withTrashed();
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function repliedBy()
    {
        return $this->belongsTo(User::class, 'staff_replied_by');
    }

    // Earlier versions, saved whenever the member edited this entry.
    public function edits()
    {
        return $this->hasMany(FeedbackEdit::class, 'item_id')->where('kind', 'rating');
    }
}

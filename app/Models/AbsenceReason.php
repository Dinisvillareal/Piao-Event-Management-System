<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A member's reason for not attending a past event (UC-16 alternate flow).
class AbsenceReason extends Model
{
    protected $table = 'absence_reasons';

    // Fixed choices so staff can count them. Labels live in the front end.
    public const REASONS = ['schedule', 'sick', 'not_informed', 'no_transport', 'work_family', 'not_interested', 'other'];

    protected $fillable = ['event_id', 'user_id', 'reason', 'comment'];

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
        return $this->hasMany(FeedbackEdit::class, 'item_id')->where('kind', 'absence');
    }
}

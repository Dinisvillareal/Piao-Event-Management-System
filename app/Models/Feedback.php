<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

class Feedback extends Model
{
    use SoftDeletes;

    protected $table = 'feedback';

    protected $fillable = [
        'event_id',
        'user_id',
        'rating',
        'comment',
        // Frozen-at-submission window values (see FeedbackController::store()).
        // A change to Settings → Feedback Rules after this row was created
        // never rewrites them, so existing feedback keeps its original window.
        'close_after_hours',
        'edit_window_minutes',
        // Staff response layer (heart / reply / member like-reply).
        'staff_liked_at',
        'staff_reply',
        'staff_replied_at',
        'staff_replied_by',
        'member_liked_reply_at',
        // Who soft-deleted it (a resident who removed their feedback).
        'deleted_by',
    ];

    protected $casts = [
        'staff_liked_at'        => 'datetime',
        'staff_replied_at'      => 'datetime',
        'member_liked_reply_at' => 'datetime',
        'close_after_hours'     => 'integer',
        'edit_window_minutes'   => 'integer',
        'rating'                => 'integer',
    ];

    // ==================================================================
    // RELATIONSHIPS
    // ==================================================================

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

    /**
     * Earlier versions of this feedback, saved whenever the member edits.
     * (Filtered by kind='rating' so absence-reason edits — which live in
     * the same feedback_edits table under kind='absence' — never leak in.)
     */
    public function edits()
    {
        return $this->hasMany(FeedbackEdit::class, 'item_id')->where('kind', 'rating');
    }

    // ==================================================================
    // WINDOW HELPERS (single source of truth for lock state)
    // ==================================================================

    /**
     * The moment this specific record can no longer be edited or removed.
     * Uses the row's OWN frozen edit_window_minutes — NOT the current
     * AppSetting value — so later Settings changes never retroactively
     * extend or shrink an existing record's window.
     */
    public function editDeadline(): Carbon
    {
        return $this->created_at->copy()->addMinutes((int) $this->edit_window_minutes);
    }

    public function isEditLocked(): bool
    {
        return now()->greaterThan($this->editDeadline());
    }

    /**
     * Seconds remaining in the edit window (0 once locked). The controller
     * uses this to reject edits/removals with 403; the frontend uses the
     * same value for the "Editable for X more minutes" countdown.
     */
    public function editSecondsLeft(): int
    {
        if ($this->isEditLocked()) {
            return 0;
        }

        return max(0, (int) floor(now()->diffInSeconds($this->editDeadline(), false)));
    }

    /**
     * When a resident can no longer submit feedback for this event for the
     * FIRST time (the 12-hour window). Uses this record's own frozen
     * close_after_hours value.
     *
     * Only meaningful for rows that already exist — a brand-new submission
     * has no row yet, so the controller computes the submit window from
     * the CURRENT AppSetting value before the row is created.
     */
    public function submitClosesAt(): ?Carbon
    {
        $event = $this->relationLoaded('event')
            ? $this->event
            : $this->event()->first();

        if (!$event) {
            return null;
        }

        $end = $event->event_end ?? $event->event_start;
        if (!$end) {
            return null;
        }

        return Carbon::parse($end)->addHours((int) $this->close_after_hours);
    }

    public function isSubmitWindowClosed(): bool
    {
        $closes = $this->submitClosesAt();
        return $closes !== null && now()->greaterThan($closes);
    }
}
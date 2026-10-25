<?php

namespace App\Http\Controllers;

use App\Models\AbsenceReason;
use App\Models\AppSetting;
use App\Services\SecurityService;
use Illuminate\Support\Carbon;
use App\Models\Event;
use App\Models\Feedback;
use App\Models\FeedbackEdit;
use App\Models\EventAttendance;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;

class FeedbackController extends Controller
{
    /**
     * True once a resident's attendance record can be reviewed: either
     * they signed in AND out (status 'Complete'), or they signed in and
     * the event's own end time has already passed. The second branch
     * covers a resident who genuinely attended the whole event but
     * forgot to tap out again -- without it they'd be stuck
     * 'Incomplete' forever and could never leave feedback, even though
     * the event is long over. Checking status alone (the original bug)
     * let a resident submit feedback the moment they signed in,
     * potentially before the event had even started; requiring
     * 'Complete' alone (an earlier fix) swung too far the other way and
     * permanently locked out anyone who forgot to sign out. Events with
     * no event_end configured can't be confirmed as "ended" this way,
     * so only a true 'Complete' status counts for those.
     */
    private function attendanceIsReviewable(EventAttendance $attendance): bool
    {
        if ($attendance->status === 'Complete') {
            return true;
        }

        $event = $attendance->event;
        return $event && $event->event_end && now()->greaterThan($event->event_end);
    }

    // ---------------------------------------------------------------------
    // Feedback rules (set by Head Staff in Settings -> Feedback Rules)
    // ---------------------------------------------------------------------

    /** Moment feedback for this event stops being accepted. */
    private function closesAt(Event $event): ?Carbon
    {
        $end = $event->event_end ?: $event->event_start;
        return $end ? Carbon::parse($end)->addHours(AppSetting::feedbackRules()['close_after_hours']) : null;
    }

    private function windowClosed(Event $event): bool
    {
        $closes = $this->closesAt($event);
        return $closes !== null && now()->greaterThan($closes);
    }

    /** Edits are allowed for a few minutes after the first submit, then the entry is locked. */
    private function editLocked($row): bool
    {
        if (!$row->created_at) {
            return true;
        }
        $minutes = AppSetting::feedbackRules()['edit_window_minutes'];
        return $row->created_at->copy()->addMinutes($minutes)->lessThan(now());
    }

    private function secondsLeftToEdit($row): int
    {
        if (!$row->created_at) {
            return 0;
        }
        $minutes = AppSetting::feedbackRules()['edit_window_minutes'];
        return max(0, (int) floor(now()->diffInSeconds($row->created_at->copy()->addMinutes($minutes), false)));
    }

    public function rules()
    {
        return response()->json(AppSetting::feedbackRules());
    }

    // Head Staff only (route middleware) -- and it re-asks for their password.
    public function updateRules(Request $request)
    {
        $request->validate([
            'close_after_hours' => 'required|integer|min:1|max:720',
            'edit_window_minutes' => 'required|integer|min:0|max:1440',
        ]);

        app(SecurityService::class)->requirePassword(auth()->user(), $request->password);

        $rules = AppSetting::saveFeedbackRules((int) $request->close_after_hours, (int) $request->edit_window_minutes);

        $this->createLog(
            'Update Feedback Rules',
            'Settings',
            "Feedback closes {$rules['close_after_hours']} hour(s) after an event ends; members can edit for {$rules['edit_window_minutes']} minute(s)."
        );

        return response()->json($rules);
    }

    /** A member "attended" if the entrance recorded a time-in or a time-out for them. */
    private function attendedScope($query)
    {
        return $query->where(fn ($q) => $q->whereNotNull('time_in')->orWhereNotNull('time_out'));
    }

    // UC-16: Submit Post-Event Feedback
    public function store(Request $request)
    {
        $request->validate([
            'event_id' => 'required|exists:events,id',
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:500',
        ]);

        $userId = auth()->id();

        $attendance = $this->attendedScope(
            EventAttendance::with('event')
                ->where('event_id', $request->event_id)
                ->where('user_id', $userId)
        )->first();

        if (!$attendance) {
            return response()->json(['message' => 'Only members who attended this event (checked in at the entrance) can leave feedback.'], 403);
        }

        if (!$this->attendanceIsReviewable($attendance)) {
            return response()->json(['message' => 'Feedback is only available after the event has ended.'], 403);
        }

        $rules = AppSetting::feedbackRules();
        $existing = Feedback::where('event_id', $request->event_id)->where('user_id', $userId)->first();
        if ($existing) {
            if ($this->editLocked($existing)) {
                return response()->json(['message' => "You can only edit your feedback within {$rules['edit_window_minutes']} minute(s) after sending it."], 403);
            }
        } elseif ($this->windowClosed($attendance->event)) {
            return response()->json(['message' => "Feedback for this event closed {$rules['close_after_hours']} hour(s) after it ended."], 403);
        }

        // Keep the version being replaced, so the edit history can show it.
        if ($existing && ((int) $existing->rating !== (int) $request->rating || trim((string) $existing->comment) !== trim((string) $request->comment))) {
            FeedbackEdit::create([
                'kind' => 'rating',
                'item_id' => $existing->id,
                'rating' => $existing->rating,
                'comment' => $existing->comment,
                'written_at' => $existing->updated_at,
            ]);
        }

        $feedback = Feedback::updateOrCreate(
            ['event_id' => $request->event_id, 'user_id' => $userId],
            ['rating' => $request->rating, 'comment' => $request->comment]
        );

        $this->notifyStaff($feedback, $attendance->event, auth()->user());

        return response()->json(['message' => 'Thank you for your feedback!', 'feedback' => $feedback], 201);
    }

    /**
     * Tells every staff account that a member just sent (or changed) feedback.
     * One in-app notification per staff user, type "feedback_received", shown
     * in the staff bell. Never allowed to fail the member's submission.
     */
    private function notifyStaff(Feedback $feedback, $event, $member): void
    {
        try {
            $staffIds = User::where('role', 'Staff')->where('id', '!=', $member->id)->pluck('id');
            if ($staffIds->isEmpty()) {
                return;
            }

            $name = trim(($member->first_name ?? '') . ' ' . ($member->last_name ?? '')) ?: 'A member';
            $eventName = $event->name ?? 'an event';
            $verb = $feedback->wasRecentlyCreated ? 'sent feedback' : 'updated their feedback';
            $comment = trim((string) $feedback->comment);
            $message = '"' . $eventName . '" - ' . (int) $feedback->rating . '/5'
                . ($comment !== '' ? "\n" . $comment : '');
            $now = now();

            Notification::insert($staffIds->map(fn ($id) => [
                'user_id' => $id,
                'event_id' => $event->id ?? null,
                'type' => 'feedback_received',
                'title' => "{$name} {$verb}",
                'message' => $message,
                'is_updated' => false,
                'read' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all());
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // Events the resident attended and can now review but hasn't rated
    // yet (drives the feedback prompt) -- same reviewable rule as store().
    public function pending(Request $request)
    {
        $userId = auth()->id();

        $attended = $this->attendedScope(
            EventAttendance::with('event')->where('user_id', $userId)
        )->get()
            ->filter(fn ($a) => $a->event !== null)
            ->filter(fn ($a) => $this->attendanceIsReviewable($a))
            ->pluck('event')
            ->unique('id')
            ->reject(fn ($event) => $this->windowClosed($event))
            ->values();

        $rated = Feedback::where('user_id', $userId)->pluck('event_id');

        $pending = $attended->reject(fn ($event) => $rated->contains($event->id))->values();

        return response()->json($pending);
    }

    // The resident's own feedback across all events -- drives the
    // "you rated this X stars" / edit-in-place state of the reviews
    // module on the Events page, as opposed to pending() which only
    // covers Complete-status events still awaiting a first rating.
    public function mine(Request $request)
    {
        $feedback = Feedback::withCount('edits')->where('user_id', auth()->id())
            ->get(['id', 'event_id', 'rating', 'comment', 'staff_liked_at', 'staff_reply', 'staff_replied_at', 'created_at'])
            ->map(fn ($f) => array_merge($f->toArray(), ['edit_seconds_left' => $this->secondsLeftToEdit($f)]))
            ->values();

        return response()->json($feedback);
    }

    public function forEvent($eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            Feedback::withCount('edits')->with(['user:id,first_name,last_name', 'repliedBy:id,first_name,last_name'])
                ->where('event_id', $eventId)
                ->latest()
                ->get()
        );
    }

    // ---------------------------------------------------------------------
    // Non-attendance reasons (UC-16 alternate flow)
    // ---------------------------------------------------------------------

    private const REASON_LABELS = [
        'schedule' => 'Schedule conflict',
        'sick' => 'Sick or unwell',
        'not_informed' => "Didn't know about it",
        'no_transport' => 'No transportation',
        'work_family' => 'Work or family duties',
        'not_interested' => 'Not interested',
        'other' => 'Other',
    ];

    /** Past events only: an event with no end time counts as over once its start has passed. */
    private function eventIsOver(Event $event): bool
    {
        $end = $event->event_end ?: $event->event_start;
        return $end && now()->greaterThan($end);
    }

    // A member who did NOT attend a finished event says why.
    public function storeAbsence(Request $request)
    {
        $request->validate([
            'event_id' => 'required|exists:events,id',
            'reason' => 'required|string|in:' . implode(',', AbsenceReason::REASONS),
            'comment' => 'nullable|string|max:500',
        ]);

        $userId = auth()->id();
        $event = Event::findOrFail($request->event_id);

        if (!$this->eventIsOver($event)) {
            return response()->json(['message' => 'You can tell us why you could not attend once the event has ended.'], 403);
        }

        $attended = $this->attendedScope(
            EventAttendance::where('event_id', $event->id)->where('user_id', $userId)
        )->exists();
        if ($attended) {
            return response()->json(['message' => 'You attended this event, so you can rate it instead.'], 403);
        }

        $rules = AppSetting::feedbackRules();
        $existing = AbsenceReason::where('event_id', $event->id)->where('user_id', $userId)->first();
        if ($existing) {
            if ($this->editLocked($existing)) {
                return response()->json(['message' => "You can only change your answer within {$rules['edit_window_minutes']} minute(s) after sending it."], 403);
            }
        } elseif ($this->windowClosed($event)) {
            return response()->json(['message' => "This closed {$rules['close_after_hours']} hour(s) after the event ended."], 403);
        }

        if ($existing && ($existing->reason !== $request->reason || trim((string) $existing->comment) !== trim((string) $request->comment))) {
            FeedbackEdit::create([
                'kind' => 'absence',
                'item_id' => $existing->id,
                'reason' => $existing->reason,
                'comment' => $existing->comment,
                'written_at' => $existing->updated_at,
            ]);
        }

        $row = AbsenceReason::updateOrCreate(
            ['event_id' => $event->id, 'user_id' => $userId],
            ['reason' => $request->reason, 'comment' => $request->comment]
        );

        $this->notifyStaffAbsence($row, $event, auth()->user());

        return response()->json(['message' => 'Thank you for letting us know.', 'absence' => $row], 201);
    }

    public function mineAbsences()
    {
        return response()->json(
            AbsenceReason::withCount('edits')->where('user_id', auth()->id())
                ->get(['id', 'event_id', 'reason', 'comment', 'staff_liked_at', 'staff_reply', 'staff_replied_at', 'created_at'])
                ->map(fn ($r) => array_merge($r->toArray(), ['edit_seconds_left' => $this->secondsLeftToEdit($r)]))
                ->values()
        );
    }

    public function absencesForEvent($eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            AbsenceReason::withCount('edits')->with(['user:id,first_name,last_name', 'repliedBy:id,first_name,last_name'])
                ->where('event_id', $eventId)
                ->latest()
                ->get()
        );
    }

    private function notifyStaffAbsence(AbsenceReason $row, Event $event, $member): void
    {
        try {
            $staffIds = User::where('role', 'Staff')->where('id', '!=', $member->id)->pluck('id');
            if ($staffIds->isEmpty()) {
                return;
            }

            $name = trim(($member->first_name ?? '') . ' ' . ($member->last_name ?? '')) ?: 'A member';
            $comment = trim((string) $row->comment);
            $message = '"' . ($event->name ?? 'an event') . '" - ' . (self::REASON_LABELS[$row->reason] ?? $row->reason)
                . ($comment !== '' ? "\n" . $comment : '');
            $now = now();

            Notification::insert($staffIds->map(fn ($id) => [
                'user_id' => $id,
                'event_id' => $event->id,
                'type' => 'feedback_received',
                'title' => "{$name} sent a reason for not attending",
                'message' => $message,
                'is_updated' => false,
                'read' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all());
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // ---------------------------------------------------------------------
    // Staff responses: a heart (acknowledged) and a reply, on a rating or a reason
    // ---------------------------------------------------------------------

    private function findResponseTarget(string $kind, $id)
    {
        return $kind === 'absence'
            ? AbsenceReason::with('event')->findOrFail($id)
            : Feedback::with('event')->findOrFail($id);
    }

    private function notifyMember($target, string $title, string $message): void
    {
        try {
            $now = now();
            Notification::insert([[
                'user_id' => $target->user_id,
                'event_id' => $target->event_id,
                'type' => 'feedback_reply',
                'title' => $title,
                'message' => $message,
                'is_updated' => false,
                'read' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ]]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // Toggle the staff heart. The member is told only the first time it is given.
    public function like(string $kind, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $target = $this->findResponseTarget($kind, $id);
        $liking = $target->staff_liked_at === null;
        $target->staff_liked_at = $liking ? now() : null;
        $target->save();

        if ($liking && $target->wasChanged('staff_liked_at') && !Notification::where('user_id', $target->user_id)
            ->where('type', 'feedback_reply')->where('event_id', $target->event_id)
            ->where('title', 'Barangay staff liked your ' . ($kind === 'absence' ? 'response' : 'feedback'))->exists()) {
            $this->notifyMember(
                $target,
                'Barangay staff liked your ' . ($kind === 'absence' ? 'response' : 'feedback'),
                '"' . ($target->event->name ?? 'an event') . '"'
            );
        }

        return response()->json(['staff_liked_at' => $target->staff_liked_at]);
    }

    // Write, change or clear (empty text) the staff reply.
    private function notifyReplyLike($target, string $kind): void
    {
        try {
            $member = auth()->user();
            $name = trim(($member->first_name ?? '') . ' ' . ($member->last_name ?? '')) ?: 'A member';
            $title = $name . ' liked your reply on their ' . ($kind === 'absence' ? 'response' : 'feedback');
            $message = '"' . ($target->event->name ?? 'an event') . "\"\n" . $target->staff_reply;

            $exists = Notification::where('user_id', $target->staff_replied_by)
                ->where('type', 'feedback_received')->where('event_id', $target->event_id)
                ->where('title', $title)->where('message', $message)->exists();
            if ($exists) {
                return;
            }

            $now = now();
            Notification::insert([[
                'user_id' => $target->staff_replied_by,
                'event_id' => $target->event_id,
                'type' => 'feedback_received',
                'title' => $title,
                'message' => $message,
                'is_updated' => false,
                'read' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ]]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // The author heart-reacts to the staff reply under their own rating / reason.
    public function likeReply(string $kind, $id)
    {
        $target = $this->findResponseTarget($kind, $id);

        if ((int) $target->user_id !== (int) auth()->id() || $target->staff_reply === null) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $liking = $target->member_liked_reply_at === null;
        $target->member_liked_reply_at = $liking ? now() : null;
        $target->save();

        // Tell the staff member who wrote the reply -- once per reply, not on every toggle.
        if ($liking && $target->staff_replied_by) {
            $this->notifyReplyLike($target, $kind);
        }

        return response()->json(['member_liked_reply_at' => $target->member_liked_reply_at]);
    }

    public function reply(Request $request, string $kind, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate(['reply' => 'nullable|string|max:500']);

        $target = $this->findResponseTarget($kind, $id);
        $text = trim((string) $request->reply);

        if ($text === '') {
            $target->staff_reply = null;
            $target->staff_replied_at = null;
            $target->staff_replied_by = null;
            $target->member_liked_reply_at = null;
            $target->save();
        } else {
            $changed = $text !== $target->staff_reply;
            $target->staff_reply = $text;
            $target->staff_replied_at = now();
            $target->staff_replied_by = auth()->id();
            $target->save();

            if ($changed) {
                $this->notifyMember(
                    $target,
                    'Barangay staff replied to your ' . ($kind === 'absence' ? 'response' : 'feedback'),
                    '"' . ($target->event->name ?? 'an event') . "\"\n" . $text
                );
            }
        }

        $target->load('repliedBy:id,first_name,last_name');

        return response()->json([
            'staff_reply' => $target->staff_reply,
            'staff_replied_at' => $target->staff_replied_at,
            'replied_by' => $target->repliedBy,
        ]);
    }

    // The "Edited" history of one rating / reason: the current version first,
    // then each earlier one, newest to oldest. Visible to staff and to the author.
    public function history(string $kind, $id)
    {
        $row = $kind === 'absence' ? AbsenceReason::findOrFail($id) : Feedback::findOrFail($id);

        if (!$this->isStaff() && (int) $row->user_id !== (int) auth()->id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $shape = fn ($r, $at, $current) => [
            'rating' => $kind === 'rating' ? (int) $r->rating : null,
            'reason' => $kind === 'absence' ? $r->reason : null,
            'comment' => $r->comment,
            'at' => $at,
            'current' => $current,
        ];

        $versions = collect([$shape($row, $row->updated_at, true)]);
        FeedbackEdit::where('kind', $kind)->where('item_id', $row->id)->orderByDesc('id')->get()
            ->each(fn ($e) => $versions->push($shape($e, $e->written_at ?? $e->created_at, false)));

        return response()->json($versions->values());
    }
}

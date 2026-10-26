<?php

namespace App\Http\Controllers;

use App\Models\AbsenceReason;
use App\Models\AppSetting;
use App\Models\Event;
use App\Models\Feedback;
use App\Models\FeedbackEdit;
use App\Models\EventAttendance;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class FeedbackController extends Controller
{
    // ==================================================================
    // WINDOW HELPERS
    // ==================================================================

    /**
     * True once a resident's attendance record can be reviewed
     * (signed out AND the event has ended, or status explicitly Complete).
     */
    private function attendanceIsReviewable(EventAttendance $attendance): bool
    {
        if ($attendance->status === 'Complete') {
            return true;
        }

        $event = $attendance->event;
        return $event && $event->event_end && now()->greaterThan($event->event_end);
    }

    /**
     * A member "attended" if the entrance recorded a time-in or time-out.
     */
    private function attendedScope($query)
    {
        return $query->where(fn ($q) => $q->whereNotNull('time_in')->orWhereNotNull('time_out'));
    }

    /**
     * When the submit window (12h default) closes for a NEW feedback row.
     * Reads the CURRENT AppSetting because there is no row yet to hold
     * a frozen value. Once the row exists, feedback.close_after_hours is
     * authoritative for all future edit/delete checks.
     */
    private function submitClosesAtFor(Event $event): ?Carbon
    {
        $rules = AppSetting::feedbackRules();
        $end = $event->event_end ?? $event->event_start;
        if (!$end) {
            return null;
        }
        return Carbon::parse($end)->addHours((int) $rules['close_after_hours']);
    }

    /**
     * Same idea for absence reasons (which do not have per-row frozen
     * columns today — they follow the current Settings live).
     */
    private function absenceClosesAtFor(Event $event): ?Carbon
    {
        $rules = AppSetting::feedbackRules();
        $end = $event->event_end ?? $event->event_start;
        if (!$end) {
            return null;
        }
        return Carbon::parse($end)->addHours((int) $rules['close_after_hours']);
    }

    // ==================================================================
    // SETTINGS (Head Staff only — see route middleware)
    // ==================================================================

    public function rules()
    {
        return response()->json(AppSetting::feedbackRules());
    }

    public function updateRules(Request $request)
    {
        $request->validate([
            'close_after_hours'   => 'required|integer|min:1|max:168',  // 1 hour … 7 days
            'edit_window_minutes' => 'required|integer|min:1|max:120',  // 1 min … 2 hours
            'password'            => 'required|string',
        ]);

        app(\App\Services\SecurityService::class)
            ->requirePassword(auth()->user(), $request->password);

        $rules = AppSetting::saveFeedbackRules(
            (int) $request->close_after_hours,
            (int) $request->edit_window_minutes,
        );

        $this->createLog(
            'Update Feedback Rules',
            'Settings',
            "Feedback rules updated: submit window {$rules['close_after_hours']}h, "
            . "edit window {$rules['edit_window_minutes']}m"
        );

        return response()->json($rules);
    }

    // ==================================================================
    // SUBMIT / EDIT (same endpoint) + REMOVE
    // ==================================================================

    /**
     * Create OR edit feedback — one endpoint for both.
     *
     *  • No existing row  → first submit. Requires the submit window
     *                        (12h default) to still be open. Freezes the
     *                        CURRENT Settings onto the new row so later
     *                        Settings changes never affect it.
     *  • Existing row      → edit. Requires the row's OWN frozen
     *                        edit_window_minutes to still be open.
     *                        Never extends the window — a feedback_edits
     *                        history row is written for the version
     *                        being replaced.
     */
    public function store(Request $request)
    {
        $request->validate([
            'event_id' => 'required|integer|exists:events,id',
            'rating'   => 'required|integer|min:1|max:5',
            'comment'  => 'nullable|string|max:1000',
        ]);

        $userId = auth()->id();

        $attendance = $this->attendedScope(
            EventAttendance::with('event')
                ->where('event_id', $request->event_id)
                ->where('user_id', $userId)
        )->first();

        if (!$attendance) {
            return response()->json([
                'message' => 'Only members who attended this event (checked in at the entrance) can leave feedback.',
            ], 403);
        }

        if (!$this->attendanceIsReviewable($attendance)) {
            return response()->json([
                'message' => 'Feedback is only available after the event has ended.',
            ], 403);
        }

        $event = $attendance->event;

        $existing = Feedback::withTrashed()
            ->where('event_id', $request->event_id)
            ->where('user_id', $userId)
            ->first();

        // ---------------------------------------------------------------
        // EDIT PATH — uses the row's FROZEN edit_window_minutes
        // ---------------------------------------------------------------
        if ($existing && !$existing->trashed()) {
            if ($existing->isEditLocked()) {
                return response()->json([
                    'message' => "Editing is closed. Feedback can only be changed within {$existing->edit_window_minutes} minute(s) after it was first sent.",
                    'code'    => 'edit_window_closed',
                ], 403);
            }

            // Keep the version being replaced, so the edit history shows it.
            FeedbackEdit::create([
                'kind'       => 'rating',
                'item_id'    => $existing->id,
                'rating'     => $existing->rating,
                'comment'    => $existing->comment,
                'written_at' => $existing->updated_at ?? $existing->created_at,
            ]);

            $existing->update([
                'rating'  => (int) $request->rating,
                'comment' => $request->comment,
            ]);

            $this->createLog(
                'Update',
                'Feedback',
                "Edited feedback for event '{$event->name}' (rating {$request->rating}/5)"
            );

            $this->notifyStaff($existing, $event, auth()->user());

            return response()->json([
                'message'  => 'Feedback updated.',
                'feedback' => $this->shapeRow($existing->fresh()),
            ]);
        }

        // ---------------------------------------------------------------
        // FIRST-SUBMIT PATH — reads CURRENT Settings, then freezes them
        // ---------------------------------------------------------------
        $closes = $this->submitClosesAtFor($event);
        if ($closes && now()->greaterThan($closes)) {
            $rules = AppSetting::feedbackRules();
            return response()->json([
                'message' => "Feedback for this event closed {$rules['close_after_hours']} hour(s) after it ended.",
                'code'    => 'submit_window_closed',
            ], 403);
        }

        $rules = AppSetting::feedbackRules();

        $feedback = Feedback::create([
            'event_id'            => $event->id,
            'user_id'             => $userId,
            'rating'              => (int) $request->rating,
            'comment'             => $request->comment,
            // Freeze the CURRENT rules onto the record. This is what future
            // edit/remove checks will use — never the live Settings again.
            'close_after_hours'   => (int) $rules['close_after_hours'],
            'edit_window_minutes' => (int) $rules['edit_window_minutes'],
        ]);

        $this->createLog(
            'Create',
            'Feedback',
            "Submitted feedback for event '{$event->name}' (rating {$request->rating}/5)"
        );

        $this->notifyStaff($feedback, $event, auth()->user());

        return response()->json([
            'message'  => 'Thank you for your feedback!',
            'feedback' => $this->shapeRow($feedback->fresh()),
        ], 201);
    }

    /**
     * Remove the resident's own feedback (soft delete). Uses the row's
     * FROZEN edit_window_minutes. Past the window → 403, same rule as
     * editing. Staff cannot remove someone else's feedback via this route.
     */
    public function destroy($id)
    {
        $userId = auth()->id();

        $feedback = Feedback::with('event')->findOrFail($id);

        if ((int) $feedback->user_id !== (int) $userId) {
            return response()->json([
                'message' => 'You can only remove your own feedback.',
            ], 403);
        }

        if ($feedback->isEditLocked()) {
            return response()->json([
                'message' => "Removing feedback is closed. It can only be removed within {$feedback->edit_window_minutes} minute(s) after it was first sent.",
                'code'    => 'edit_window_closed',
            ], 403);
        }

        // Keep the version being removed in the history, exactly like an edit.
        FeedbackEdit::create([
            'kind'       => 'rating',
            'item_id'    => $feedback->id,
            'rating'     => $feedback->rating,
            'comment'    => $feedback->comment,
            'written_at' => $feedback->updated_at ?? $feedback->created_at,
        ]);

        $feedback->deleted_by = auth()->user()->user_code;
        $feedback->save();
        $feedback->delete();

        $eventName = $feedback->event?->name ?? 'Unknown event';
        $this->createLog('Delete', 'Feedback', "Removed feedback for event '{$eventName}'");

        return response()->json(['message' => 'Feedback removed.']);
    }

    /**
     * Shared JSON shape returned by store()/mine() so the frontend always
     * receives the same fields (edit_seconds_left, is_locked, ...).
     */
    private function shapeRow(Feedback $f): array
    {
        return array_merge($f->toArray(), [
            'edit_seconds_left'   => $f->editSecondsLeft(),
            'edit_window_minutes' => $f->edit_window_minutes,
            'close_after_hours'   => $f->close_after_hours,
            'is_locked'           => $f->isEditLocked(),
        ]);
    }

    // ==================================================================
    // MEMBER READS
    // ==================================================================

    public function mine()
    {
        $feedback = Feedback::withCount('edits')
            ->where('user_id', auth()->id())
            ->get([
                'id', 'event_id', 'rating', 'comment',
                'staff_liked_at', 'staff_reply', 'staff_replied_at',
                'member_liked_reply_at', 'created_at',
                'edit_window_minutes', 'close_after_hours',
            ])
            ->map(fn ($f) => array_merge($f->toArray(), [
                'edit_seconds_left' => max(0, (int) floor(now()->diffInSeconds(
                    $f->created_at->copy()->addMinutes((int) $f->edit_window_minutes), false
                ))),
                'is_locked' => now()->greaterThan(
                    $f->created_at->copy()->addMinutes((int) $f->edit_window_minutes)
                ),
            ]));

        return response()->json($feedback);
    }

    public function pending()
    {
        $userId = auth()->id();

        $attended = $this->attendedScope(
            EventAttendance::with('event')->where('user_id', $userId)
        )->get()
            ->filter(fn ($a) => $a->event !== null)
            ->filter(fn ($a) => $this->attendanceIsReviewable($a))
            ->pluck('event')
            ->unique('id')
            ->reject(function ($event) {
                $closes = $this->submitClosesAtFor($event);
                return $closes && now()->greaterThan($closes);
            })
            ->values();

        // withTrashed() so a removed feedback doesn't pop back up as "pending".
        $rated = Feedback::withTrashed()->where('user_id', $userId)->pluck('event_id');
        $pending = $attended->reject(fn ($event) => $rated->contains($event->id))->values();

        return response()->json($pending);
    }

    public function forEvent($eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            Feedback::withCount('edits')
                ->with(['user:id,first_name,last_name', 'repliedBy:id,first_name,last_name'])
                ->where('event_id', $eventId)
                ->latest()
                ->get()
        );
    }

    // ==================================================================
    // ABSENCE REASONS
    // ==================================================================

    private function eventIsOver(Event $event): bool
    {
        $end = $event->event_end ?? $event->event_start;
        return $end && now()->greaterThan($end);
    }

    public function storeAbsence(Request $request)
    {
        $request->validate([
            'event_id' => 'required|integer|exists:events,id',
            'reason'   => 'required|string|max:40',
            'comment'  => 'nullable|string|max:1000',
        ]);

        $userId = auth()->id();
        $event  = Event::findOrFail($request->event_id);

        if (!$this->eventIsOver($event)) {
            return response()->json(['message' => 'You can tell us why you could not attend once the event has ended.'], 403);
        }

        $attended = $this->attendedScope(
            EventAttendance::where('event_id', $event->id)->where('user_id', $userId)
        )->exists();

        if ($attended) {
            return response()->json(['message' => 'You attended this event, so you can rate it instead.'], 403);
        }

        $existing = AbsenceReason::where('event_id', $event->id)->where('user_id', $userId)->first();
        $rules = AppSetting::feedbackRules();

        if ($existing) {
            // Same 20-minute rule applied live (absence reasons don't have
            // frozen columns; they follow current Settings).
            $locked = $existing->created_at->copy()->addMinutes((int) $rules['edit_window_minutes']);
            if (now()->greaterThan($locked)) {
                return response()->json([
                    'message' => "You can only change your answer within {$rules['edit_window_minutes']} minute(s) after sending it.",
                ], 403);
            }
        } else {
            $closes = $this->absenceClosesAtFor($event);
            if ($closes && now()->greaterThan($closes)) {
                return response()->json([
                    'message' => "This closed {$rules['close_after_hours']} hour(s) after the event ended.",
                ], 403);
            }
        }

        $row = AbsenceReason::updateOrCreate(
            ['event_id' => $event->id, 'user_id' => $userId],
            ['reason' => $request->reason, 'comment' => $request->comment],
        );

        $this->createLog(
            $existing ? 'Update' : 'Create',
            'Feedback',
            ($existing ? 'Edited' : 'Submitted') . " non-attendance reason for event '{$event->name}' ({$request->reason})"
        );

        $this->notifyStaffAbsence($row, $event, auth()->user());

        return response()->json(['message' => 'Thank you for letting us know.', 'absence' => $row], 201);
    }

    public function mineAbsences()
    {
        $rules = AppSetting::feedbackRules();

        return response()->json(
            AbsenceReason::withCount('edits')
                ->where('user_id', auth()->id())
                ->get([
                    'id', 'event_id', 'reason', 'comment',
                    'staff_liked_at', 'staff_reply', 'staff_replied_at',
                    'member_liked_reply_at', 'created_at',
                ])
                ->map(fn ($r) => array_merge($r->toArray(), [
                    'edit_seconds_left' => max(0, (int) floor(now()->diffInSeconds(
                        $r->created_at->copy()->addMinutes((int) $rules['edit_window_minutes']), false
                    ))),
                ]))
                ->values()
        );
    }

    public function absencesForEvent($eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            AbsenceReason::withCount('edits')
                ->with(['user:id,first_name,last_name', 'repliedBy:id,first_name,last_name'])
                ->where('event_id', $eventId)
                ->latest()
                ->get()
        );
    }

    // ==================================================================
    // STAFF RESPONSES (heart / reply / member like-reply / history)
    // ==================================================================

    private function findResponseTarget(string $kind, $id)
    {
        return $kind === 'absence'
            ? AbsenceReason::with('event')->findOrFail($id)
            : Feedback::with('event')->findOrFail($id);
    }

    private function notifyMember($target, string $title, string $message): void
    {
        Notification::insert([[
            'user_id'    => $target->user_id,
            'event_id'   => $target->event_id,
            'type'       => 'feedback_reply',
            'title'      => $title,
            'message'    => $message,
            'read'       => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]]);
    }

    public function like(string $kind, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $target = $this->findResponseTarget($kind, $id);
        $liking = $target->staff_liked_at === null;
        $target->staff_liked_at = $liking ? now() : null;
        $target->save();

        if ($liking && $target->wasChanged('staff_liked_at')) {
            $this->notifyMember(
                $target,
                'Barangay staff liked your ' . ($kind === 'absence' ? 'response' : 'feedback'),
                'Your ' . ($kind === 'absence' ? 'reason' : 'rating') . ' was acknowledged by barangay staff.'
            );
        }

        return response()->json(['staff_liked_at' => $target->staff_liked_at]);
    }

    public function likeReply(string $kind, $id)
    {
        $target = $this->findResponseTarget($kind, $id);

        if ((int) $target->user_id !== (int) auth()->id() || $target->staff_reply === null) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $liking = $target->member_liked_reply_at === null;
        $target->member_liked_reply_at = $liking ? now() : null;
        $target->save();

        if ($liking && $target->staff_replied_by) {
            $this->notifyReplyLike($target, $kind);
        }

        return response()->json(['member_liked_reply_at' => $target->member_liked_reply_at]);
    }

    private function notifyReplyLike($target, string $kind): void
    {
        if (!$target->staff_replied_by) {
            return;
        }

        $member = auth()->user();
        $title   = 'Member liked your reply';
        $message = "{$member->first_name} {$member->last_name} liked your reply on their "
                 . ($kind === 'absence' ? 'reason' : 'feedback') . '.';

        $exists = Notification::where('user_id', $target->staff_replied_by)
            ->where('type', 'feedback_received')
            ->where('event_id', $target->event_id)
            ->where('title', $title)
            ->where('message', $message)
            ->exists();

        if ($exists) {
            return;
        }

        Notification::insert([[
            'user_id'    => $target->staff_replied_by,
            'event_id'   => $target->event_id,
            'type'       => 'feedback_received',
            'title'      => $title,
            'message'    => $message,
            'read'       => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]]);
    }

    public function reply(Request $request, string $kind, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate(['reply' => 'nullable|string|max:500']);

        $target = $this->findResponseTarget($kind, $id);
        $text   = trim((string) $request->reply);

        $target->staff_reply      = $text !== '' ? $text : null;
        $target->staff_replied_at = $text !== '' ? now() : null;
        $target->staff_replied_by = $text !== '' ? auth()->id() : null;
        $target->save();

        if ($text !== '') {
            $this->notifyMember(
                $target,
                'Barangay staff replied to your ' . ($kind === 'absence' ? 'reason' : 'feedback'),
                $text
            );
        }

        $target->load('repliedBy:id,first_name,last_name');

        return response()->json([
            'staff_reply'      => $target->staff_reply,
            'staff_replied_at' => $target->staff_replied_at,
            'replied_by'       => $target->repliedBy,
        ]);
    }

    public function history(string $kind, $id)
    {
        $row = $kind === 'absence'
            ? AbsenceReason::findOrFail($id)
            : Feedback::withTrashed()->findOrFail($id);

        if (!$this->isStaff() && (int) $row->user_id !== (int) auth()->id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $shape = fn ($r, $when, $current) => [
            'rating'  => $r->rating ?? null,
            'reason'  => $r->reason ?? null,
            'comment' => $r->comment,
            'at'      => optional($when)->toIso8601String(),
            'current' => $current,
        ];

        $versions = collect([$shape($row, $row->updated_at, true)]);
        FeedbackEdit::where('kind', $kind)
            ->where('item_id', $row->id)
            ->orderByDesc('id')
            ->get()
            ->each(fn ($e) => $versions->push($shape($e, $e->written_at ?? $e->created_at, false)));

        return response()->json($versions->values());
    }

    // ==================================================================
    // STAFF NOTIFICATIONS (never block the member's submission)
    // ==================================================================

    private function notifyStaff(Feedback $feedback, $event, $member): void
    {
        try {
            $staffIds = User::where('role', 'Staff')
                ->where('id', '!=', $member->id)
                ->pluck('id');

            if ($staffIds->isEmpty()) {
                return;
            }

            $msg = "{$member->first_name} {$member->last_name} rated \"{$event->name}\": "
                 . "{$feedback->rating}/5"
                 . ($feedback->comment ? " — {$feedback->comment}" : '');

            Notification::insert($staffIds->map(fn ($id) => [
                'user_id'    => $id,
                'event_id'   => $event->id,
                'type'       => 'feedback_received',
                'title'      => 'New feedback received',
                'message'    => $msg,
                'read'       => false,
                'created_at' => now(),
                'updated_at' => now(),
            ])->all());
        } catch (\Throwable $e) {
            \Log::warning('notifyStaff failed: ' . $e->getMessage());
        }
    }

    private function notifyStaffAbsence(AbsenceReason $row, Event $event, $member): void
    {
        try {
            $staffIds = User::where('role', 'Staff')
                ->where('id', '!=', $member->id)
                ->pluck('id');

            if ($staffIds->isEmpty()) {
                return;
            }

            $msg = "{$member->first_name} {$member->last_name} reported couldn't attend "
                 . "\"{$event->name}\": {$row->reason}";

            Notification::insert($staffIds->map(fn ($id) => [
                'user_id'    => $id,
                'event_id'   => $event->id,
                'type'       => 'feedback_received',
                'title'      => "Couldn't attend reported",
                'message'    => $msg,
                'read'       => false,
                'created_at' => now(),
                'updated_at' => now(),
            ])->all());
        } catch (\Throwable $e) {
            \Log::warning('notifyStaffAbsence failed: ' . $e->getMessage());
        }
    }
}
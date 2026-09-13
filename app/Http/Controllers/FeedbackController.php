<?php

namespace App\Http\Controllers;

use App\Models\Feedback;
use App\Models\EventAttendance;
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

    // UC-16: Submit Post-Event Feedback
    public function store(Request $request)
    {
        $request->validate([
            'event_id' => 'required|exists:events,id',
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:500',
        ]);

        $userId = auth()->id();

        $attendance = EventAttendance::with('event')
            ->where('event_id', $request->event_id)
            ->where('user_id', $userId)
            ->whereNotNull('time_in')
            ->first();

        if (!$attendance || !$this->attendanceIsReviewable($attendance)) {
            return response()->json(['message' => 'Feedback is only available after the event has ended.'], 403);
        }

        $feedback = Feedback::updateOrCreate(
            ['event_id' => $request->event_id, 'user_id' => $userId],
            ['rating' => $request->rating, 'comment' => $request->comment]
        );

        return response()->json(['message' => 'Thank you for your feedback!', 'feedback' => $feedback], 201);
    }

    // Events the resident attended and can now review but hasn't rated
    // yet (drives the feedback prompt) -- same reviewable rule as store().
    public function pending(Request $request)
    {
        $userId = auth()->id();

        $attended = EventAttendance::with('event')
            ->where('user_id', $userId)
            ->whereNotNull('time_in')
            ->get()
            ->filter(fn ($a) => $a->event !== null)
            ->filter(fn ($a) => $this->attendanceIsReviewable($a))
            ->pluck('event')
            ->unique('id')
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
        $feedback = Feedback::where('user_id', auth()->id())
            ->get(['id', 'event_id', 'rating', 'comment']);

        return response()->json($feedback);
    }

    public function forEvent($eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            Feedback::with('user:id,first_name,last_name')
                ->where('event_id', $eventId)
                ->latest()
                ->get()
        );
    }
}

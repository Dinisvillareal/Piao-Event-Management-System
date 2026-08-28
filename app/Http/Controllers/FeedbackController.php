<?php

namespace App\Http\Controllers;

use App\Models\Feedback;
use App\Models\EventAttendance;
use Illuminate\Http\Request;

class FeedbackController extends Controller
{
    private function isStaff()
    {
        return auth()->user()?->role === 'Staff';
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

        $attended = EventAttendance::where('event_id', $request->event_id)
            ->where('user_id', $userId)
            ->whereNotNull('time_in')
            ->exists();

        if (!$attended) {
            return response()->json(['message' => 'Feedback is only available after attending the event.'], 403);
        }

        $feedback = Feedback::updateOrCreate(
            ['event_id' => $request->event_id, 'user_id' => $userId],
            ['rating' => $request->rating, 'comment' => $request->comment]
        );

        return response()->json(['message' => 'Thank you for your feedback!', 'feedback' => $feedback], 201);
    }

    // Events the resident completed but hasn't rated yet (drives the feedback prompt)
    public function pending(Request $request)
    {
        $userId = auth()->id();

        $completed = EventAttendance::with('event')
            ->where('user_id', $userId)
            ->where('status', 'Complete')
            ->get()
            ->filter(fn ($a) => $a->event !== null)
            ->pluck('event')
            ->unique('id')
            ->values();

        $rated = Feedback::where('user_id', $userId)->pluck('event_id');

        $pending = $completed->reject(fn ($event) => $rated->contains($event->id))->values();

        return response()->json($pending);
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

<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\EventAttendance;
use App\Models\Event;
use App\Models\User;
use App\Models\ActivityLog;

class EventAttendanceController extends Controller
{
  private function determineStatus($timeIn, $timeOut)
    {
        if ($timeIn && $timeOut) return 'Complete';
        return 'Incomplete';
    }

    // =========================
    // TIME IN - updates status from 'missed' to 'Incomplete'
    // =========================

    public function timeIn(Request $request)
    {
        $request->validate([
            'event_id' => 'required|exists:events,id',
            'user_id' => 'required|exists:users,id',
        ]);

        // ✅ Fetch the event AND the user to get their actual names
        $event = Event::findOrFail($request->event_id);
        $user = User::findOrFail($request->user_id);
        $userName = $user->first_name . ' ' . $user->last_name;

        // Sign-in window = [call_time_start, event_start]. Call time lets
        // staff invite residents earlier than the event's actual start
        // (e.g. call time 6:00, event starts 7:00) instead of sign-in being
        // open for the whole event duration. Events with no call time set
        // have no early bound at all (sign-in just stays open any time up
        // to event_start) -- NOT the same instant as event_start, which
        // would make the window zero-width.
        $currentTime = time();
        $windowOpen = $event->call_time_start ? strtotime($event->call_time_start) : null;
        $windowClose = strtotime($event->event_start);

        if ($windowOpen !== null && $currentTime < $windowOpen) {
            return response()->json([
                'message' => 'Sign-in is not open yet. It opens at ' . date('g:i A', $windowOpen) . '.',
            ], 403);
        }

        if ($currentTime > $windowClose) {
            return response()->json([
                'message' => 'Sign-in window has closed. It closed at ' . date('g:i A', $windowClose) . '.',
            ], 403);
        }

        DB::beginTransaction();

        try {
            $attendance = EventAttendance::where('event_id', $request->event_id)
                ->where('user_id', $request->user_id)
                ->first();

            if ($attendance) {
                if ($attendance->time_in) {
                    return response()->json(['message' => 'Member already signed in.'], 400);
                }

                $attendance->time_in = now();
                $attendance->status = 'Incomplete';
                $attendance->save();

                // ✅ Log with Name, Event Title, and 'QR' module
                $this->createLog(
                    'Time In',
                    'QR',
                    "{$userName} signed in to {$event->name}"
                );

                DB::commit();
                return response()->json(['message' => 'Time-in successful!', 'attendance' => $attendance]);
            }

            $attendance = EventAttendance::create([
                'event_id' => $request->event_id,
                'user_id' => $request->user_id,
                'time_in' => now(),
                'status' => 'Incomplete'
            ]);

            // ✅ Log with Name, Event Title, and 'QR' module
            $this->createLog(
                'Time In',
                'QR',
                "{$userName} signed in to {$event->name}"
            );

            DB::commit();
            return response()->json(['message' => 'Time-in successful!', 'attendance' => $attendance], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Time-in failed', 'error' => $e->getMessage()], 500);
        }
    }

    // TIME OUT - sets status to 'Complete' when both times exist
    public function timeOut(Request $request)
    {
        $request->validate([
            'event_id' => 'required|exists:events,id',
            'user_id' => 'required|exists:users,id',
        ]);

        // ✅ Fetch the event AND the user to get their actual names
        $event = Event::findOrFail($request->event_id);
        $user = User::findOrFail($request->user_id);
        $userName = $user->first_name . ' ' . $user->last_name;

        // Sign-out window = [event_end, call_time_end]. Events with no
        // event_end skip this check entirely (old behavior -- no
        // restriction). Events with event_end but no call_time_end get an
        // open-ended window starting at event_end (no upper bound).
        if ($event->event_end) {
            $currentTime = time();
            $windowOpen = strtotime($event->event_end);

            if ($currentTime < $windowOpen) {
                return response()->json([
                    'message' => 'Sign-out is not open yet. It opens at ' . date('g:i A', $windowOpen) . '.',
                ], 403);
            }

            if ($event->call_time_end) {
                $windowClose = strtotime($event->call_time_end);
                if ($currentTime > $windowClose) {
                    return response()->json([
                        'message' => 'Sign-out window has closed. It closed at ' . date('g:i A', $windowClose) . '.',
                    ], 403);
                }
            }
        }

        DB::beginTransaction();

        try {
            $attendance = EventAttendance::where('event_id', $request->event_id)
                ->where('user_id', $request->user_id)
                ->first();

            if (!$attendance) {
                $attendance = EventAttendance::create([
                    'event_id' => $request->event_id,
                    'user_id' => $request->user_id,
                    'time_out' => now(),
                    'status' => 'Incomplete'
                ]);

                // ✅ Log with Name, Event Title, and 'QR' module
                $this->createLog(
                    'Time Out',
                    'QR',
                    "{$userName} timed out without time-in on {$event->name}"
                );

                DB::commit();
                return response()->json(['message' => 'Time-out recorded without time-in.', 'attendance' => $attendance], 201);
            }

            if ($attendance->time_out) {
                return response()->json(['message' => 'Member already signed out.'], 400);
            }

            $attendance->time_out = now();
            $attendance->status = ($attendance->time_in && $attendance->time_out) ? 'Complete' : 'Incomplete';
            $attendance->save();

            // ✅ Log with Name, Event Title, and 'QR' module
            $this->createLog(
                'Time Out',
                'QR',
                "{$userName} signed out of {$event->name}"
            );

            DB::commit();
            return response()->json(['message' => 'Time-out successful!', 'attendance' => $attendance]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Time-out failed', 'error' => $e->getMessage()], 500);
        }
    }
    // =========================
    // EVENT ATTENDEES
    // =========================

    public function getEventAttendees($eventId)
    {
        return response()->json(
            EventAttendance::with('user')
                ->where('event_id', $eventId)
                ->orderBy('time_in', 'desc')
                ->get()
        );
    }

   public function getMemberHistory($userId)
{
    $attendances = EventAttendance::where('user_id', $userId)
        ->with('event')  // ✅ ADD THIS - LOADS THE EVENT RELATIONSHIP
        ->orderBy('time_in', 'desc')
        ->get()
        ->map(function ($attendance) {
            $isEventDeleted = is_null($attendance->event);
            
            return [
                'id' => $attendance->id,
                'eventId' => $attendance->event_id,
                'eventTitle' => $isEventDeleted ? '' : $attendance->event->name,
                'eventDate' => $isEventDeleted ? '' : $attendance->event->event_start,
                'location' => $isEventDeleted ? '' : $attendance->event->location,
                'timeIn' => $attendance->time_in,
                'timeOut' => $attendance->time_out,
                'status' => $attendance->status,
                'isEventDeleted' => $isEventDeleted,
            ];
        });
    
    return response()->json($attendances);
}
}
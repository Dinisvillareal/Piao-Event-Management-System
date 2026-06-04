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
    private function createLog($action, $module, $description)
    {
        ActivityLog::create([
            'user_code'   => auth()->user()?->user_code ?? 'SYSTEM',
            'action'      => $action,
            'module'      => $module,
            'description' => $description,
        ]);
    }

    // TIME IN - updates status from 'missed' to 'Incomplete'
    public function timeIn(Request $request)
    {
        $request->validate([
            'event_id' => 'required|exists:events,id',
            'user_id' => 'required|exists:users,id',
        ]);

        $event = Event::findOrFail($request->event_id);

        $currentTime = time();
        $eventStart = strtotime($event->event_start);
        $eventEnd = strtotime($event->event_end);

        if ($currentTime < $eventStart) {
            return response()->json(['message' => 'Sign-in is not available yet.'], 403);
        }

        if ($currentTime > $eventEnd) {
            return response()->json(['message' => 'Sign-in is closed.'], 403);
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

                $this->createLog(
                    'Time In',
                    'Event Attendance',
                    "User {$attendance->user_id} signed in to event {$attendance->event_id}"
                );

                DB::commit();

                return response()->json([
                    'message' => 'Time-in successful!',
                    'attendance' => $attendance
                ]);
            }

            $attendance = EventAttendance::create([
                'event_id' => $request->event_id,
                'user_id' => $request->user_id,
                'time_in' => now(),
                'status' => 'Incomplete'
            ]);

            $this->createLog(
                'Time In',
                'Event Attendance',
                "User {$attendance->user_id} signed in to event {$attendance->event_id}"
            );

            DB::commit();

            return response()->json([
                'message' => 'Time-in successful!',
                'attendance' => $attendance
            ], 201);

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

                $this->createLog(
                    'Time Out',
                    'Event Attendance',
                    "User {$request->user_id} timed out without time-in on event {$request->event_id}"
                );

                DB::commit();

                return response()->json([
                    'message' => 'Time-out recorded without time-in.',
                    'attendance' => $attendance
                ], 201);
            }

            if ($attendance->time_out) {
                return response()->json(['message' => 'Member already signed out.'], 400);
            }

            $attendance->time_out = now();
            $attendance->status = ($attendance->time_in && $attendance->time_out) ? 'Complete' : 'Incomplete';
            $attendance->save();

            $this->createLog(
                'Time Out',
                'Event Attendance',
                "User {$attendance->user_id} signed out of event {$attendance->event_id}"
            );

            DB::commit();

            return response()->json([
                'message' => 'Time-out successful!',
                'attendance' => $attendance
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Time-out failed', 'error' => $e->getMessage()], 500);
        }
    }

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
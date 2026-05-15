<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\EventAttendance;
use App\Models\Event;
use App\Models\User;

class AttendanceController extends Controller
{
    // TIME IN (When they scan the QR code to enter)
    public function timeIn(Request $request)
    {
        $request->validate([
            'event_id' => 'required|exists:events,id',
            'user_id' => 'required|exists:users,id',
        ]);

        // Check if they already scanned in
        $existing = Attendance::where('event_id', $request->event_id)
                              ->where('user_id', $request->user_id)
                              ->first();

        if ($existing) {
            return response()->json([
                'message' => 'Member is already signed in to this event.',
                'attendance' => $existing
            ], 400); // 400 Bad Request
        }

        // Create the record
        $attendance = Attendance::create([
            'event_id' => $request->event_id,
            'user_id' => $request->user_id,
            'time_in' => now(),
            'status' => 'Incomplete' 
        ]);

        return response()->json([
            'message' => 'Time-in successful!',
            'attendance' => $attendance
        ], 201);
    }

    // TIME OUT (When they scan the QR code to leave)
    public function timeOut(Request $request)
    {
        $request->validate([
            'event_id' => 'required|exists:events,id',
            'user_id' => 'required|exists:users,id',
        ]);

        // Find the specific attendance record
        $attendance = Attendance::where('event_id', $request->event_id)
                              ->where('user_id', $request->user_id)
                              ->first();

        if (!$attendance) {
            return response()->json([
                'message' => 'No time-in record found for this member at this event.'
            ], 404);
        }

        if ($attendance->status === 'Complete') {
            return response()->json([
                'message' => 'Member has already timed out of this event.'
            ], 400);
        }

        // Update the record
        $attendance->update([
            'time_out' => now(),
            'status' => 'Complete'
        ]);

        return response()->json([
            'message' => 'Time-out successful!',
            'attendance' => $attendance
        ]);
    }

    // GET ATTENDANCE FOR A SPECIFIC EVENT (For the Staff Dashboard)
    public function getEventAttendees($eventId)
    {
        // This fetches the attendance records AND attaches the Member's info to it automatically
        $attendances = Attendance::with('user')
                                 ->where('event_id', $eventId)
                                 ->orderBy('time_in', 'desc')
                                 ->get();

        return response()->json($attendances);
    }

    // GET ATTENDANCE FOR A SPECIFIC MEMBER (For the Member Dashboard)
    public function getMemberHistory($userId)
    {
        // Fetches all events a specific member has attended
        $attendances = Attendance::with('event')
                                 ->where('user_id', $userId)
                                 ->orderBy('time_in', 'desc')
                                 ->get();

        return response()->json($attendances);
    }
}
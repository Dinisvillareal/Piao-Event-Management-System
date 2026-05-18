<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\EventAttendance;
use App\Models\Event;
use App\Models\User;

class EventAttendanceController extends Controller
{
    // TIME IN (When they scan the QR code to enter)
    public function timeIn(Request $request)
{
    $request->validate([
        'event_id' => 'required|exists:events,id',
        'user_id' => 'required|exists:users,id',
    ]);

    $attendance = EventAttendance::where('event_id', $request->event_id)
        ->where('user_id', $request->user_id)
        ->first();

    // If record already exists
    if ($attendance) {

        // Prevent double time-in
        if ($attendance->time_in) {
            return response()->json([
                'message' => 'Member already signed in.'
            ], 400);
        }

        // Add time_in
        $attendance->time_in = now();

        // Update status
        $attendance->status = $this->determineStatus(
            $attendance->time_in,
            $attendance->time_out
        );

        $attendance->save();

        return response()->json([
            'message' => 'Time-in successful!',
            'attendance' => $attendance
        ]);
    }

    // Create new attendance
    $attendance = EventAttendance::create([
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

    $attendance = EventAttendance::where('event_id', $request->event_id)
        ->where('user_id', $request->user_id)
        ->first();

    // If no record exists yet, create one
    if (!$attendance) {

        $attendance = EventAttendance::create([
            'event_id' => $request->event_id,
            'user_id' => $request->user_id,
            'time_out' => now(),
            'status' => 'Incomplete'
        ]);

        return response()->json([
            'message' => 'Time-out recorded without time-in.',
            'attendance' => $attendance
        ], 201);
    }

    // Prevent double timeout
    if ($attendance->time_out) {
        return response()->json([
            'message' => 'Member already signed out.'
        ], 400);
    }

    // Add timeout
    $attendance->time_out = now();

    // Update status
    $attendance->status = $this->determineStatus(
        $attendance->time_in,
        $attendance->time_out
    );

    $attendance->save();

    return response()->json([
        'message' => 'Time-out successful!',
        'attendance' => $attendance
    ]);
}

    // GET ATTENDANCE FOR A SPECIFIC EVENT (For the Staff Dashboard)
    public function getEventAttendees($eventId)
    {
        // This fetches the attendance records AND attaches the Member's info to it automatically
        $attendances = EventAttendance::with('user')
                                     ->where('event_id', $eventId)
                                     ->orderBy('time_in', 'desc')
                                     ->get();

        return response()->json($attendances);
    }

    // GET ATTENDANCE FOR A SPECIFIC MEMBER (For the Member Dashboard)
    public function getMemberHistory($userId)
    {
        // Fetches all events a specific member has attended
        $attendances = EventAttendance::with('event')
                                 ->where('user_id', $userId)
                                 ->orderBy('time_in', 'desc')
                                 ->get();

        return response()->json($attendances);
    }

    private function determineStatus($timeIn, $timeOut)
{
    if ($timeIn && $timeOut) {
        return 'Complete';
    }

    return 'Incomplete';
}
}
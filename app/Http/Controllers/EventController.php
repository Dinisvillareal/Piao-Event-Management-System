<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Event;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class EventController extends Controller
{
    // READ ALL WITH PAGINATION
    public function index(Request $request)
    {
        dd(Auth::user());
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Unauthenticated'
            ], 401);
        }

        $perPage = $request->get('per_page', 20);

        $user = Auth::user();

        // ADMIN & STAFF = SEE ALL EVENTS
        if ($user->role === 'Admin' || $user->role === 'Staff') {

            $events = Event::paginate($perPage);

            return response()->json($events);
        }

        // RESIDENT MEMBERSHIPS
        $membershipIds = DB::table('membership_residents')
            ->where('user_id', $user->id)
            ->pluck('membership_id')
            ->toArray();

        $events = Event::where(function ($q) use ($membershipIds) {
            $q->whereNull('membership_id')
                ->orWhereIn('membership_id', $membershipIds);
        })
            ->get();

        return response()->json($events);
    }

    //  READ ALL
    public function list()
    {
        return response()->json(Event::all());
    }

    //  READ ONE
    public function show($id)
    {
        $event = Event::findOrFail($id);
        return response()->json($event);
    }

    //  CREATE
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'required|string',
            'location' => 'nullable|string|max:100',
            'event_start' => 'required|date',
            'event_end' => 'required|date|after:event_start',
        ]);

        $event = Event::create([
            'name' => $request->name,
            'description' => $request->description,
            'location' => $request->location,
            'event_start' => $request->event_start,
            'event_end' => $request->event_end,
            'membership_id' => $request->membership_id,
        ]);
        return response()->json([
            'message' => 'Event created successfully',
            'event' => $event
        ]);
    }

    //  UPDATE
    public function update(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'required|string',
            'location' => 'nullable|string|max:100',
            'event_start' => 'required|date',
            'event_end' => 'required|date|after:event_start',
            'membership_id' => 'nullable|exists:memberships,id',
        ]);

        $event = Event::findOrFail($id);

        $event->update([
            'name' => $request->name,
            'description' => $request->description,
            'location' => $request->location,
            'event_start' => $request->event_start,
            'event_end' => $request->event_end,
            'membership_id' => $request->membership_id,
        ]);

        return response()->json([
            'message' => 'Event updated successfully',
            'event' => $event
        ]);
    }

    //  DELETE
    public function destroy($id)
    {
        $event = Event::findOrFail($id);
        $event->delete();

        return response()->json([
            'message' => 'Event deleted successfully'
        ]);
    }
}

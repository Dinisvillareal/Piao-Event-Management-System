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
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $perPage = $request->get('per_page', 20);

        // Admin & Staff see all events
        if (in_array($user->role, ['Admin', 'Staff', 'STAFF / ADMIN'])) {
            $events = Event::paginate($perPage);

            // Attach membership names to each event
            $events->getCollection()->transform(function ($event) {
                $event->memberships = $event->memberships;
                return $event;
            });

            return response()->json($events);
        }

        $residentMembershipIds = DB::table('membership_residents')
            ->where('user_id', $user->id)
            ->pluck('membership_id')
            ->toArray();

        $events = $this->getResidentEventQuery($residentMembershipIds)
            ->paginate($perPage);

        $events->getCollection()->transform(function ($event) {
            $event->memberships = $event->memberships;
            return $event;
        });

        return response()->json($events);
    }

    public function data(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        if (in_array($user->role, ['Admin', 'Staff', 'STAFF / ADMIN'])) {
            $events = Event::all();
        } else {
            $residentMembershipIds = DB::table('membership_residents')
                ->where('user_id', $user->id)
                ->pluck('membership_id')
                ->toArray();

            $events = $this->getResidentEventQuery($residentMembershipIds)->get();
        }

        $events->transform(function ($event) {
            $event->memberships = $event->memberships;
            return $event;
        });

        return response()->json(['data' => $events]);
    }

    protected function getResidentEventQuery(array $residentMembershipIds)
    {
        return Event::where(function ($q) use ($residentMembershipIds) {
            $q->whereNull('membership_ids')
              ->orWhereJsonLength('membership_ids', 0);

            foreach ($residentMembershipIds as $mid) {
                $q->orWhereJsonContains('membership_ids', $mid);
                $q->orWhereJsonContains('membership_ids', (string) $mid);
            }
        });
    }

    // READ ALL (no pagination)
    public function list()
    {
        $events = Event::all();

        $events->transform(function ($event) {
            $event->memberships = $event->memberships;
            return $event;
        });

        return response()->json($events);
    }

    // READ ONE
    public function show($id)
    {
        $event = Event::findOrFail($id);
        $event->memberships = $event->memberships;
        return response()->json($event);
    }

    // CREATE
    public function store(Request $request)
    {
        $request->validate([
            'name'             => 'required|string|max:255',
            'description'      => 'required|string',
            'location'         => 'nullable|string|max:100',
            'event_start'      => 'required|date',
            'event_end'        => 'required|date|after:event_start',
            'membership_ids'   => 'nullable|array',
            'membership_ids.*' => 'integer|exists:memberships,id',
        ]);

        $membershipIds = array_map('intval', $request->membership_ids ?? []);

        $event = Event::create([
            'name'           => $request->name,
            'description'    => $request->description,
            'location'       => $request->location,
            'event_start'    => $request->event_start,
            'event_end'      => $request->event_end,
            'membership_ids' => $membershipIds,
        ]);

        $event->memberships = $event->memberships;

        return response()->json([
            'message' => 'Event created successfully',
            'event'   => $event,
        ], 201);
    }

    // UPDATE
    public function update(Request $request, $id)
    {
        $request->validate([
            'name'             => 'required|string|max:255',
            'description'      => 'required|string',
            'location'         => 'nullable|string|max:100',
            'event_start'      => 'required|date',
            'event_end'        => 'required|date|after:event_start',
            'membership_ids'   => 'nullable|array',
            'membership_ids.*' => 'integer|exists:memberships,id',
        ]);

        $event = Event::findOrFail($id);

        $membershipIds = array_map('intval', $request->membership_ids ?? []);

        $event->update([
            'name'           => $request->name,
            'description'    => $request->description,
            'location'       => $request->location,
            'event_start'    => $request->event_start,
            'event_end'      => $request->event_end,
            'membership_ids' => $membershipIds,
        ]);

        $event->memberships = $event->memberships;

        return response()->json([
            'message' => 'Event updated successfully',
            'event'   => $event,
        ]);
    }

    // DELETE
    public function destroy($id)
    {
        Event::findOrFail($id)->delete();

        return response()->json(['message' => 'Event deleted successfully']);
    }
}
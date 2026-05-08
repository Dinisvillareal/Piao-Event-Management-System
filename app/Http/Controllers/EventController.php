<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Event;

class EventController extends Controller
{
    // READ ALL WITH PAGINATION
    public function index(Request $request)
    {
        
        $perPage = $request->get('per_page', 20);

        $events = Event::paginate($perPage);

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
            'event_start' => 'required|date',
            'event_end' => 'required|date|after:event_start',
        ]);

        $event = Event::create([
            'name' => $request->name,
            'description' => $request->description,
            'event_start' => $request->event_start,
            'event_end' => $request->event_end,
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
            'event_start' => 'required|date',
            'event_end' => 'required|date|after:event_start',
        ]);

        $event = Event::findOrFail($id);

        $event->update([
            'name' => $request->name,
            'description' => $request->description,
            'event_start' => $request->event_start,
            'event_end' => $request->event_end,
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
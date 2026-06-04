<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use App\Models\ActivityLog;
use App\Models\EventAttendance; // ✅ FIXED: missing import
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

        if ($user->role === 'Staff') {
            return response()->json(Event::paginate($perPage));
        }

        $residentMembershipIds = DB::table('membership_residents')
            ->where('user_id', $user->id)
            ->pluck('membership_id')
            ->toArray();

        $events = Event::where(function ($q) use ($residentMembershipIds) {
            $q->whereRaw('JSON_LENGTH(membership_ids) = 0')
              ->orWhereNull('membership_ids');

            foreach ($residentMembershipIds as $mid) {
                $q->orWhereJsonContains('membership_ids', $mid);
            }
        })->paginate($perPage);

        return response()->json($events);
    }

    public function data(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        if ($user->role === 'Staff') {
            $events = Event::all();
        } else {
            $residentMembershipIds = DB::table('membership_residents')
                ->where('user_id', $user->id)
                ->pluck('membership_id')
                ->toArray();

            $events = Event::where(function ($q) use ($residentMembershipIds) {
                $q->whereRaw('JSON_LENGTH(membership_ids) = 0')
                  ->orWhereNull('membership_ids');

                foreach ($residentMembershipIds as $mid) {
                    $q->orWhereJsonContains('membership_ids', $mid);
                }
            })->get();
        }

        return response()->json(['data' => $events]);
    }

    public function list()
    {
        return response()->json(Event::all());
    }

    public function show($id)
    {
        return response()->json(Event::findOrFail($id));
    }

    public function store(Request $request)
    {
        $request->validate([
            'name'                 => 'required|string|max:255',
            'description'          => 'required|string',
            'location'             => 'nullable|string|max:100',
            'event_start'          => 'required|date',
            'membership_ids'       => 'nullable|array',
            'membership_ids.*'     => 'integer|exists:memberships,id',
            'notification_message' => 'nullable|string|max:500',
        ]);

        DB::beginTransaction();

        try {
            $event = Event::create([
                'name'                 => $request->name,
                'description'          => $request->description,
                'location'             => $request->location,
                'event_start'          => $request->event_start,
                'event_end'            => null,
                'membership_ids'       => $request->membership_ids ?? [],
                'notification_message' => $request->notification_message,
            ]);

            $event->createAttendanceRecords();

            // Send notifications
            $this->sendEventNotifications($event, false);

            DB::commit();

            // Event Log
            ActivityLog::create([
                'user_code'   => auth()->user()->user_code,
                'action'      => 'Create',
                'module'      => 'Events',
                'description' => "Created event: {$event->name}",
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);

            // Notification Log
            if (!empty($event->notification_message)) {
                ActivityLog::create([
                    'user_code'   => auth()->user()->user_code,
                    'action'      => 'Create',
                    'module'      => 'Notifications',
                    'description' => "Sent notification for event: {$event->name}",
                    'created_at'  => now()->addMilliseconds(500),
                    'updated_at'  => now()->addMilliseconds(500),
                ]);
            }

            return response()->json([
                'message' => 'Event created successfully',
                'event'   => $event,
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to create event: ' . $e->getMessage()
            ], 500);
        }
    }

public function update(Request $request, $id)
{
    $request->validate([
        'name'                 => 'required|string|max:255',
        'description'          => 'required|string',
        'location'             => 'nullable|string|max:100',
        'event_start'          => 'required|date',
        'membership_ids'       => 'nullable|array',
        'membership_ids.*'     => 'integer|exists:memberships,id',
        'notification_message' => 'nullable|string|max:500',
    ]);

    $event = Event::findOrFail($id);

    $originalMessage = $event->notification_message;
    $originalMembershipIds = $event->membership_ids ?? [];
    $newMembershipIds = $request->membership_ids ?? [];

    $membershipChanged = $originalMembershipIds != $newMembershipIds;

    DB::beginTransaction();

    try {
        $event->update([
            'name'                 => $request->name,
            'description'          => $request->description,
            'location'             => $request->location,
            'event_start'          => $request->event_start,
            'membership_ids'       => $newMembershipIds,
            'notification_message' => $request->notification_message,
        ]);

        if ($membershipChanged) {
            $event->syncAttendanceRecords();
        }

        $notificationUpdated = false;

        if ($originalMessage != $request->notification_message) {
            $this->sendEventNotifications($event, true);
            $notificationUpdated = true;
        }

        DB::commit();

        // Event Log
        ActivityLog::create([
            'user_code'   => auth()->user()->user_code,
            'action'      => 'Update',
            'module'      => 'Events',
            'description' => "Updated event: {$event->name}",
            'created_at'  => now()->addMilliseconds(500),
            'updated_at'  => now()->addMilliseconds(500),
        ]);

        // Notification Log
        if ($notificationUpdated) {
            ActivityLog::create([
                'user_code'   => auth()->user()->user_code,
                'action'      => 'Update',
                'module'      => 'Notifications',
                'description' => "Updated notification for event: {$event->name}",
                'created_at'  => now()->addMilliseconds(500),
                'updated_at'  => now()->addMilliseconds(500),
            ]);
        }

        return response()->json([
            'message' => 'Event updated successfully',
            'event'   => $event,
        ]);

    } catch (\Exception $e) {
        DB::rollBack();

        return response()->json([
            'message' => 'Failed to update event: ' . $e->getMessage()
        ], 500);
    }
}

public function destroy($id)
{
    $user = auth()->user();

    $event = Event::findOrFail($id);
    $eventName = $event->name;

    DB::beginTransaction();

    try {
        // 1. Delete related notifications
        Notification::where('event_id', $id)->delete();

        // 2. Delete attendance records
        EventAttendance::where('event_id', $id)->delete();

        // 3. Delete event
        $event->delete();

        // 4. Activity Logs (IMPORTANT: BEFORE COMMIT)
        ActivityLog::create([
            'user_code'   => $user->user_code,
            'action'      => 'Delete',
            'module'      => 'Events',
            'description' => "Deleted event: {$eventName}",
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        ActivityLog::create([
            'user_code'   => $user->user_code,
            'action'      => 'Delete',
            'module'      => 'Notifications',
            'description' => "Deleted notifications for event: {$eventName}",
            'created_at'  => now()->addMilliseconds(500),
            'updated_at'  => now()->addMilliseconds(500),
        ]);

        DB::commit();

        return response()->json([
            'message' => 'Event deleted successfully'
        ]);

    } catch (\Exception $e) {
        DB::rollBack();

        return response()->json([
            'message' => 'Failed to delete event: ' . $e->getMessage()
        ], 500);
    }
}

    protected function sendEventNotifications(Event $event, $isUpdate = false)
    {
        $membershipIds = $event->membership_ids ?? [];

        $userIds = empty($membershipIds)
            ? User::where('role', 'Resident')->pluck('id')
            : DB::table('membership_residents')
                ->whereIn('membership_id', $membershipIds)
                ->pluck('user_id')
                ->unique();

        $staff = auth()->user();
        $staffName = 'Staff: ' . $staff->last_name;

        $title = $isUpdate
            ? 'Event Updated: ' . $event->name
            : 'New Event: ' . $event->name;

        $messageWithStaff = $staffName . ' • ' . $event->name . ' — ' .
            ($event->notification_message ?? 'New event announced');

        foreach ($userIds as $userId) {
            if ($isUpdate) {
                $notification = Notification::where('user_id', $userId)
                    ->where('event_id', $event->id)
                    ->first();

                if ($notification) {
                    $notification->update([
                        'type' => 'event_updated',
                        'title' => $title,
                        'message' => $messageWithStaff,
                        'is_updated' => true,
                        'updated_at_notification' => now(),
                        'read' => false,
                    ]);
                } else {
                    Notification::create([
                        'user_id' => $userId,
                        'event_id' => $event->id,
                        'type' => 'event_updated',
                        'title' => $title,
                        'message' => $messageWithStaff,
                        'is_updated' => true,
                        'updated_at_notification' => now(),
                        'read' => false,
                    ]);
                }
            } else {
                Notification::create([
                    'user_id' => $userId,
                    'event_id' => $event->id,
                    'type' => 'event_announcement',
                    'title' => $title,
                    'message' => $messageWithStaff,
                    'is_updated' => false,
                    'updated_at_notification' => null,
                    'read' => false,
                ]);
            }
        }
    }
}

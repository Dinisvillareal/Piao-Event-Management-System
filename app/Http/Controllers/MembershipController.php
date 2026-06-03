<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use App\Models\ActivityLog;
use App\Models\EventAttendance;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class EventController extends Controller
{
    // =========================
    // HELPERS
    // =========================

    private function createLog($action, $module, $description)
    {
        ActivityLog::create([
            'user_code'   => auth()->user()->user_code,
            'action'      => $action,
            'module'      => $module,
            'description' => $description,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);
    }

    // =========================
    // READ ALL WITH PAGINATION
    // =========================

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

    // =========================
    // CREATE EVENT
    // =========================

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'required|string',
            'location' => 'nullable|string|max:100',
            'event_start' => 'required|date',
            'membership_ids' => 'nullable|array',
            'membership_ids.*' => 'integer|exists:memberships,id',
            'notification_message' => 'nullable|string|max:500',
        ]);

        DB::beginTransaction();

        try {

            $event = Event::create([
                'name' => $request->name,
                'description' => $request->description,
                'location' => $request->location,
                'event_start' => $request->event_start,
                'event_end' => null,
                'membership_ids' => $request->membership_ids ?? [],
                'notification_message' => $request->notification_message,
            ]);

            $event->createAttendanceRecords();
            $this->sendEventNotifications($event, false);

            DB::commit();

            $this->createLog(
                'Create Event',
                'Events',
                "Created event '{$event->name}'"
            );

            return response()->json([
                'message' => 'Event created successfully',
                'event' => $event
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to create event',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // =========================
    // UPDATE EVENT
    // =========================

    public function update(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'required|string',
            'location' => 'nullable|string|max:100',
            'event_start' => 'required|date',
            'membership_ids' => 'nullable|array',
            'membership_ids.*' => 'integer|exists:memberships,id',
            'notification_message' => 'nullable|string|max:500',
        ]);

        DB::beginTransaction();

        try {

            $event = Event::findOrFail($id);

            $event->update([
                'name' => $request->name,
                'description' => $request->description,
                'location' => $request->location,
                'event_start' => $request->event_start,
                'membership_ids' => $request->membership_ids ?? [],
                'notification_message' => $request->notification_message,
            ]);

            DB::commit();

            $this->createLog(
                'Update Event',
                'Events',
                "Updated event '{$event->name}'"
            );

            return response()->json([
                'message' => 'Event updated successfully',
                'event' => $event
            ]);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to update event',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // =========================
    // DELETE EVENT
    // =========================

    public function destroy($id)
    {
        DB::beginTransaction();

        try {

            $event = Event::findOrFail($id);
            $name = $event->name;

            Notification::where('event_id', $id)->delete();
            EventAttendance::where('event_id', $id)->delete();
            $event->delete();

            DB::commit();

            $this->createLog(
                'Delete Event',
                'Events',
                "Deleted event '{$name}'"
            );

            return response()->json([
                'message' => 'Event deleted successfully'
            ]);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to delete event',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // =========================
    // NOTIFICATIONS
    // =========================

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

        $message = $staffName . ' • ' . $event->name . ' — ' .
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
                        'message' => $message,
                        'is_updated' => true,
                        'read' => false,
                    ]);
                } else {
                    Notification::create([
                        'user_id' => $userId,
                        'event_id' => $event->id,
                        'type' => 'event_updated',
                        'title' => $title,
                        'message' => $message,
                        'is_updated' => true,
                        'read' => false,
                    ]);
                }

            } else {
                Notification::create([
                    'user_id' => $userId,
                    'event_id' => $event->id,
                    'type' => 'event_announcement',
                    'title' => $title,
                    'message' => $message,
                    'is_updated' => false,
                    'read' => false,
                ]);
            }
        }
    }
}

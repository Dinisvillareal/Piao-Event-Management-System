<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use App\Models\ActivityLog;
use App\Models\EventAttendance;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Services\SmsService;
use App\Services\FacebookService;

class EventController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $perPage = $request->get('per_page', 20);

        // ✅ MODIFIED: Exclude soft-deleted events
        if ($user->role === 'Staff') {
            return response()->json(Event::withoutTrashed()->paginate($perPage));
        }

        $residentMembershipIds = DB::table('membership_residents')
            ->where('user_id', $user->id)
            ->pluck('membership_id')
            ->toArray();

        // ✅ MODIFIED: Exclude soft-deleted events
        $events = Event::where(function ($q) use ($residentMembershipIds) {
            $q->whereRaw('JSON_LENGTH(membership_ids) = 0')
              ->orWhereNull('membership_ids');

            foreach ($residentMembershipIds as $mid) {
                $q->orWhereJsonContains('membership_ids', $mid);
            }
        })
        ->withoutTrashed()  // ✅ NEW: Exclude soft-deleted
        ->paginate($perPage);

        return response()->json($events);
    }

    // ✅ MODIFIED: Improved data() method with portal mode support & soft delete
    public function data(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        // Check portal mode from request header
        $portalMode = $request->header('X-Portal-Mode', 'auto');
        
        // Determine effective role based on portal mode
        $effectiveRole = $user->role;
        if ($user->role === 'Staff' && $portalMode === 'member') {
            $effectiveRole = 'Resident';
        }

        if ($effectiveRole === 'Staff') {
            // Staff portal: show all active events (exclude soft-deleted)
            $events = Event::withoutTrashed()->get();
        } else {
            // Resident mode: filter by user's memberships (exclude soft-deleted)
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
            })
            ->withoutTrashed()  // ✅ NEW: Exclude soft-deleted
            ->get();
        }

        return response()->json(['data' => $events]);
    }

    public function list()
    {
        // ✅ MODIFIED: Exclude soft-deleted events
        return response()->json(Event::withoutTrashed()->get());
    }

    public function show($id)
    {
        // ✅ MODIFIED: Exclude soft-deleted events
        return response()->json(Event::withoutTrashed()->findOrFail($id));
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
            'approved_budget'      => 'nullable|numeric|min:0',
            'post_to_facebook'     => 'nullable|boolean',
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
                'approved_budget'      => $request->approved_budget,
            ]);

            $event->createAttendanceRecords();
            $this->sendEventNotifications($event, false);

            // Adviser recommendation: "2 in 1 — Facebook Page" second announcement channel
            if (filter_var($request->post_to_facebook, FILTER_VALIDATE_BOOLEAN)) {
                app(FacebookService::class)->postEvent(
                    'New Event: ' . $event->name,
                    $event->notification_message ?? $event->description
                );
            }

            DB::commit();

            ActivityLog::create([
                'user_code'   => auth()->user()->user_code,
                'action'      => 'Create',
                'module'      => 'Events',
                'description' => "Created event: {$event->name}",
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);

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
            'approved_budget'      => 'nullable|numeric|min:0',
        ]);

        // ✅ MODIFIED: Find event excluding soft-deleted
        $event = Event::withoutTrashed()->findOrFail($id);

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
                'approved_budget'      => $request->approved_budget,
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

            ActivityLog::create([
                'user_code'   => auth()->user()->user_code,
                'action'      => 'Update',
                'module'      => 'Events',
                'description' => "Updated event: {$event->name}",
                'created_at'  => now()->addMilliseconds(500),
                'updated_at'  => now()->addMilliseconds(500),
            ]);

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

    // ✅ MODIFIED: Implement SOFT DELETE instead of hard delete
public function destroy($id)
{
    $user = auth()->user();

    // ✅ Find only active (non-deleted) events
    $event = Event::withoutTrashed()->findOrFail($id);
    $eventName = $event->name;

    DB::beginTransaction();

    try {
        // ✅ Record who archived before soft deleting
        $event->deleted_by = $user->user_code;
        $event->save();
        
        // ✅ Step 1: Soft delete the event (sets deleted_at timestamp)
        $event->delete();

        // ✅ Step 2: Update notifications to show event was cancelled
        Notification::where('event_id', $id)->update([
            'type' => 'event_deleted',
            'title' => '❌ Event Cancelled: ' . $eventName,
            'message' => 'We apologize for the inconvenience. This event has been cancelled.',
            'is_updated' => true,
            'updated_at' => now(),
        ]);

        // ✅ Step 3: Log the archive action
        ActivityLog::create([
            'user_code'   => $user->user_code,
            'action'      => 'Archive Event',
            'module'      => 'Events',
            'description' => "Archived event: {$eventName}",
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        DB::commit();

        return response()->json(['message' => 'Event archived successfully']);

    } catch (\Exception $e) {
        DB::rollBack();
        return response()->json([
            'message' => 'Failed to archive event: ' . $e->getMessage()
        ], 500);
    }
}

    // ✅ NEW: Restore soft-deleted event (admin feature)
   public function restore($id)
{
    $user = auth()->user();

    $event = Event::onlyTrashed()->findOrFail($id);
    $eventName = $event->name;

    try {
        // ✅ Clear the deleted_by when restoring
        $event->deleted_by = null;
        $event->save();
        
        $event->restore();

        ActivityLog::create([
            'user_code'   => $user->user_code,
            'action'      => 'Restore Event',
            'module'      => 'Events',
            'description' => "Restored event from archive: {$eventName}",
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return response()->json([
            'message' => 'Event restored successfully',
            'event'   => $event,
        ]);

    } catch (\Exception $e) {
        return response()->json([
            'message' => 'Failed to restore event: ' . $e->getMessage()
        ], 500);
    }
}

    // ✅ NEW: Force delete (permanent) - for admin only
    public function forceDelete($id)
    {
        $user = auth()->user();

        // ✅ Find soft-deleted event
        $event = Event::onlyTrashed()->findOrFail($id);
        $eventName = $event->name;

        DB::beginTransaction();

        try {
            // Permanently delete notifications and attendance
            Notification::where('event_id', $id)->forceDelete();
            EventAttendance::where('event_id', $id)->forceDelete();

            // Permanently delete event
            $event->forceDelete();

            ActivityLog::create([
                'user_code'   => $user->user_code,
                'action'      => 'Force Delete',
                'module'      => 'Events',
                'description' => "Permanently deleted event: {$eventName}",
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);

            DB::commit();

            return response()->json(['message' => 'Event permanently deleted']);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to permanently delete event: ' . $e->getMessage()
            ], 500);
        }
    }

    protected function sendEventNotifications(Event $event, $isUpdate = false)
    {
        $membershipIds = $event->membership_ids ?? [];

        $userIds = empty($membershipIds)
            ? User::whereIn('role', ['Resident','Staff'])->pluck('id')
            : DB::table('membership_residents')
                ->whereIn('membership_id', $membershipIds)
                ->pluck('user_id')
                ->unique();

        // Adviser recommendation: household-head SMS, sent once per household so
        // it complements (not duplicates) the in-app notifications below. Only
        // fired on the initial announcement, not on every minor edit.
        if (!$isUpdate) {
            $residents = User::where('role', 'Resident')
                ->whereIn('id', $userIds)
                ->get(['id', 'contact_number', 'household_code', 'is_household_head', 'household_contact_number']);

            $smsMessage = trim($event->name . ' — ' . ($event->notification_message ?? 'New event announced by Barangay Piao.'));
            app(SmsService::class)->notifyHouseholds($residents, $event->id, $smsMessage);
        }

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
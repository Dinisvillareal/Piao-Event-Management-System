<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use App\Models\EventAttendance;
use App\Models\EventInventoryItem;
use App\Models\EventInventoryRelease;
use App\Models\EventInventoryReleaseUndo;
use App\Models\InventoryItem;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use App\Services\SmsService;
use App\Support\PhotoSet;
use App\Services\FacebookService;

class EventController extends Controller
{
    // Same upload/delete convention as InventoryController::localUpload --
    // evidence photos for a release ("the item came back") and for an undo
    // ("why this release is being reversed") are required proof images
    // stored on the public disk, exposed via EventInventoryRelease's
    // evidence_photo_url / undo_photo_url accessors. $folder keeps the two
    // kinds in separate storage/app/public subfolders.
    private function localUpload($file, string $folder): string
    {
        $original = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $ext      = $file->getClientOriginalExtension();
        $clean    = preg_replace('/[^A-Za-z0-9\-_.]/', '_', $original);
        $filename = time() . '_' . $clean . '.' . $ext;

        $path = $file->storeAs($folder, $filename, 'public');

        if (!$path) {
            throw new \Exception('File upload failed');
        }

        return $path;
    }

    private function localDelete(?string $path): void
    {
        if (!$path) {
            return;
        }
        try {
            Storage::disk('public')->delete($path);
        } catch (\Exception $e) {
            \Log::warning($e->getMessage());
        }
    }

    // Mirrors the frontend's Upcoming/Ongoing/Past classification
    // (EventsView.tsx getEventStatus): an event is "ongoing" once its own
    // event_start has passed and until event_end (falling back to
    // call_time_end, then end-of-day on event_start, for legacy rows
    // missing an end time). The UI already disables Edit/Archive while
    // Ongoing or Past, but that was frontend-only -- nothing stopped the
    // same request being sent directly to the API, so this enforces it
    // server-side too.
    private function isEventOngoing(Event $event): bool
    {
        $now = now();
        $start = $event->event_start;
        if (!$start) {
            return false;
        }

        $end = $event->event_end ?? $event->call_time_end;
        if (!$end) {
            $end = $start->copy()->endOfDay();
        }

        return $now->gte($start) && $now->lte($end);
    }

    /**
     * Compact, human-readable schedule line for outbound announcements
     * (Facebook post body / SMS body). Both channels need the full picture:
     * when sign-in opens (call time) AND when the event itself runs.
     *
     * Wording rule: call time is always labeled "sign-in opens" (or similar),
     * never presented as part of the event's own start/end range -- a
     * resident reading "6 AM - 11:30 AM" would think the event itself runs
     * that long, which is not what call time means.
     *
     * Returns an empty string when there's nothing to show, so callers can
     * safely append it without further checks.
     */
    private function eventScheduleLine(Event $event, string $channel = 'sms'): string
    {
        $start = $event->event_start;
        if (!$start) {
            return '';
        }

        $end       = $event->event_end;
        $callStart = $event->call_time_start;

        // Show the sign-in line only when the call time actually gives
        // residents extra time before the event. If call_time_start is
        // missing or equals/after event_start, skip it.
        $hasCallTime = $callStart && $callStart->lt($start);

        if ($channel === 'facebook') {
            $when = $start->format('F j, Y g:i A');
            if ($end) {
                $when .= ' – ' . $end->format('g:i A');
            }

            $parts = ["📅 {$when}"];

            if ($hasCallTime) {
                $parts[] = "⏰ Sign-in opens at " . $callStart->format('g:i A') .
                    " — please arrive early for check-in";
            }

            if ($event->location) {
                $parts[] = "📍 {$event->location}";
            }

            return implode("\n", $parts);
        }

        // SMS: single line, compact, no year.
        if ($hasCallTime) {
            $datePart = $start->format('M j');
            $line = $datePart
                . ', sign-in ' . $callStart->format('g:i A')
                . ', event ' . $start->format('g:i A')
                . ($end ? '-' . $end->format('g:i A') : '');
        } else {
            $line = $start->format('M j, g:i A');
            if ($end) {
                $line .= '-' . $end->format('g:i A');
            }
        }

        if ($event->location) {
            $line .= ' @ ' . $event->location;
        }

        return $line;
    }

    public function index(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $perPage = $request->get('per_page', 20);

        // ✅ MODIFIED: Exclude soft-deleted events
        if ($user->role === 'Staff') {
            return response()->json(Event::withoutTrashed()->with('borrowedItems.inventoryItem')->paginate($perPage));
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
        ->with('borrowedItems.inventoryItem')
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
            $events = Event::withoutTrashed()->with('borrowedItems.inventoryItem')->orderByDesc('event_start')->get();
            $this->attachInventoryCounts($events);
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
            ->with('borrowedItems.inventoryItem')
            ->orderByDesc('event_start')
            ->get();
        }

        return response()->json(['data' => $events]);
    }

    /**
     * Gives each event `inventory_items_count` -- how many different items it
     * took from Inventory (still out or already returned) -- in one query, so
     * the event page's Inventory tab can show its count right away.
     */
    private function attachInventoryCounts($events): void
    {
        $ids = $events->pluck('id')->all();
        if (!$ids) {
            return;
        }

        $borrowed = DB::table('event_inventory_items')->whereIn('event_id', $ids)->select('event_id', 'inventory_item_id');
        $returned = DB::table('event_inventory_releases')->whereIn('event_id', $ids)->whereNull('undone_at')->select('event_id', 'inventory_item_id');

        $counts = DB::query()->fromSub($borrowed->union($returned), 'u')
            ->select('event_id', DB::raw('COUNT(DISTINCT inventory_item_id) as c'))
            ->groupBy('event_id')
            ->pluck('c', 'event_id');

        $attendances = DB::table('attendances')->whereIn('event_id', $ids)
            ->select('event_id', DB::raw('COUNT(*) as c'))
            ->groupBy('event_id')
            ->pluck('c', 'event_id');

        // Feedback + non-attendance reasons per event, so the staff Events list
        // can offer a "Has feedback" quick tab without loading every event.
        $feedbackCounts = DB::table('feedback')->whereIn('event_id', $ids)
            ->select('event_id', DB::raw('COUNT(*) as c'))->groupBy('event_id')->pluck('c', 'event_id');
        $absenceCounts = DB::table('absence_reasons')->whereIn('event_id', $ids)
            ->select('event_id', DB::raw('COUNT(*) as c'))->groupBy('event_id')->pluck('c', 'event_id');

        foreach ($events as $event) {
            $event->setAttribute('feedback_count', (int) ($feedbackCounts[$event->id] ?? 0) + (int) ($absenceCounts[$event->id] ?? 0));
            $event->setAttribute('inventory_items_count', (int) ($counts[$event->id] ?? 0));
            // Known up front so the Attendance tab's count doesn't start at 0.
            $event->setAttribute('attendances_count', (int) ($attendances[$event->id] ?? 0));
        }
    }

    public function list()
    {
        // ✅ MODIFIED: Exclude soft-deleted events
        return response()->json(Event::withoutTrashed()->with('borrowedItems.inventoryItem')->get());
    }

    public function show($id)
    {
        // ✅ MODIFIED: Exclude soft-deleted events
        return response()->json(Event::withoutTrashed()->with('borrowedItems.inventoryItem')->findOrFail($id));
    }

    public function store(Request $request)
    {
        // Only Staff create events -- this was previously reachable by any
        // authenticated Resident (the route only requires 'auth'), letting
        // them create a real event, trigger notifications/SMS to the whole
        // barangay, and even post to the official Facebook Page.
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'name'                 => 'required|string|max:255',
            'description'          => 'required|string',
            'location'             => 'nullable|string|max:100',
            'event_start'          => 'required|date',
            'event_end'            => 'required|date|after:event_start',
            // Call time = when sign-in/out actually opens, separate from
            // the event's own start/end (e.g. call time 6:00, event starts
            // 7:00 -- sign-in is only open 6:00-7:00). Strictly BEFORE
            // event_start (not before_or_equal) -- a call time equal to
            // the event's own start time would leave a zero-length sign-in
            // window, which defeats the point of having one.
            'call_time_start'      => 'required|date|before:event_start|after_or_equal:now',
            'call_time_end'        => 'required|date|after_or_equal:event_end',
            'membership_ids'       => 'nullable|array',
            'membership_ids.*'     => 'integer|exists:memberships,id',
            'notification_message' => 'nullable|string|max:500',
            'approved_budget'      => 'nullable|numeric|min:0',
            'post_to_facebook'     => 'nullable|boolean',
            'borrowed_items'                     => 'nullable|array',
            'borrowed_items.*.inventory_item_id'  => 'required_with:borrowed_items|integer|exists:inventory_items,id',
            'borrowed_items.*.quantity'           => 'required_with:borrowed_items|integer|min:1',
            // Which units to borrow, per condition (e.g. Good => 10, New => 5).
            // When sent, their sum is the quantity borrowed.
            'borrowed_items.*.conditions'         => 'nullable|array',
            'borrowed_items.*.conditions.*'       => 'integer|min:0',
        ]);

        // Double-booking guard: two events can't reasonably share the same
        // physical venue at overlapping times (residents and staff would
        // have no way to tell which one they're actually at). `location`
        // is free-typed, not a controlled venue list, so this only catches
        // an exact match -- still worth catching, since staff usually type
        // the same handful of venue names ("Barangay Hall", etc.) the same
        // way each time.
        $venue = trim((string) $request->location);
        if ($venue !== '') {
            $conflict = Event::withoutTrashed()
                ->where('location', $venue)
                ->where('event_start', '<', $request->event_end)
                ->where('event_end', '>', $request->event_start)
                ->first();

            if ($conflict) {
                return response()->json([
                    'message' => "\"{$venue}\" is already booked for \"{$conflict->name}\" during that time. Please choose a different time or location.",
                ], 422);
            }
        }

        DB::beginTransaction();

        try {
            $event = Event::create([
                'name'                 => $request->name,
                'description'          => $request->description,
                'location'             => $request->location,
                'event_start'          => $request->event_start,
                'event_end'            => $request->event_end,
                'call_time_start'      => $request->call_time_start,
                'call_time_end'        => $request->call_time_end,
                'membership_ids'       => $request->membership_ids ?? [],
                'notification_message' => $request->notification_message,
                'approved_budget'      => $request->approved_budget,
            ]);

            $event->createAttendanceRecords();
            $this->applyBorrowedItems($event, $request->borrowed_items ?? []);
            $this->sendEventNotifications($event, false);

            // Adviser recommendation: "2 in 1 — Facebook Page" second announcement channel
            if (filter_var($request->post_to_facebook, FILTER_VALIDATE_BOOLEAN)) {
                // Build the Facebook post body: Description first (the "what is
                // this event" context), then the short Message reminder underneath
                // (the call to action), then the schedule + venue. Every part is
                // optional, so this only includes whichever ones actually have
                // content.
                $facebookBody = trim(
                    ($event->description ? $event->description : '') .
                    ($event->notification_message ? "\n\n" . $event->notification_message : '') .
                    "\n\n" . $this->eventScheduleLine($event, 'facebook')
                );

                // postEvent() never throws -- it returns [ok, message]. Keep the
                // result so a failed post is visible (laravel.log + response)
                // instead of the event saving as if Facebook had worked.
                [$fbOk, $fbMessage] = app(FacebookService::class)->postEvent(
                    'New Event: ' . $event->name,
                    $facebookBody
                );

                if ($fbOk) {
                    // Remember that this event's announcement was actually
                    // published, so update() can decide whether a future edit
                    // should re-announce it. An event that was never posted on
                    // create stays silent on edit, even if its schedule changes.
                    $event->posted_to_facebook = true;
                    $event->save();
                } else {
                    \Illuminate\Support\Facades\Log::warning('Facebook post failed: ' . $fbMessage, ['event' => $event->name]);
                }
            }

            DB::commit();

            $this->createLog('Create', 'Events', "Created event: {$event->name}");

            if (!empty($event->notification_message)) {
                $this->createLog('Create', 'Notifications', "Sent notification for event: {$event->name}", now()->addMilliseconds(500));
            }

            return response()->json([
                'message' => 'Event created successfully',
                'event'   => $event->load('borrowedItems.inventoryItem'),
                'facebook' => isset($fbOk) ? ['posted' => $fbOk, 'message' => $fbMessage] : null,
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
        // Only Staff edit events -- same reasoning as store() above. This
        // is separate from the ongoing/already-ended locks below: those
        // control WHEN an edit is allowed, this controls WHO is allowed.
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'name'                 => 'required|string|max:255',
            'description'          => 'required|string',
            'location'             => 'nullable|string|max:100',
            'event_start'          => 'required|date',
            'event_end'            => 'required|date|after:event_start',
            // Strictly BEFORE event_start -- see store() above for why.
            'call_time_start'      => 'required|date|before:event_start',
            'call_time_end'        => 'required|date|after_or_equal:event_end',
            'membership_ids'       => 'nullable|array',
            'membership_ids.*'     => 'integer|exists:memberships,id',
            'notification_message' => 'nullable|string|max:500',
            'approved_budget'      => 'nullable|numeric|min:0',
            'borrowed_items'                     => 'nullable|array',
            'borrowed_items.*.inventory_item_id'  => 'required_with:borrowed_items|integer|exists:inventory_items,id',
            'borrowed_items.*.quantity'           => 'required_with:borrowed_items|integer|min:1',
            // Which units to borrow, per condition (e.g. Good => 10, New => 5).
            // When sent, their sum is the quantity borrowed.
            'borrowed_items.*.conditions'         => 'nullable|array',
            'borrowed_items.*.conditions.*'       => 'integer|min:0',
        ]);

        // ✅ MODIFIED: Find event excluding soft-deleted
        $event = Event::withoutTrashed()->findOrFail($id);

        // Ongoing/Past events are locked -- same rule the frontend already
        // shows (disabled Edit button + hint), now enforced here too so it
        // can't be bypassed by calling the API directly.
        if ($this->isEventOngoing($event)) {
            return response()->json([
                'message' => "\"{$event->name}\" is currently ongoing and can't be edited until it ends.",
            ], 409);
        }

        if ($event->event_end && now()->gt($event->event_end)) {
            return response()->json([
                'message' => "\"{$event->name}\" has already ended and can't be edited.",
            ], 409);
        }

        // Only block a past call_time_start when it's actually being
        // changed to one -- the existing value is resubmitted on every
        // save, and it's normal for an Upcoming event's sign-in window to
        // have already opened (call_time_start passed) while the event
        // itself hasn't started yet, so that alone must not block
        // unrelated edits (e.g. fixing the description).
        $requestedCallStart = \Carbon\Carbon::parse($request->call_time_start);
        $callStartChanged = !$event->call_time_start || !$requestedCallStart->eq($event->call_time_start);
        if ($callStartChanged && $requestedCallStart->lt(now())) {
            return response()->json([
                'message' => 'Call Time (sign-in opens) can\'t be set to a time in the past.',
            ], 422);
        }

        // Same double-booking guard as store(), excluding this event
        // itself so re-saving an event without changing its time/venue
        // doesn't flag a conflict against its own previous record.
        $venue = trim((string) $request->location);
        if ($venue !== '') {
            $conflict = Event::withoutTrashed()
                ->where('id', '!=', $event->id)
                ->where('location', $venue)
                ->where('event_start', '<', $request->event_end)
                ->where('event_end', '>', $request->event_start)
                ->first();

            if ($conflict) {
                return response()->json([
                    'message' => "\"{$venue}\" is already booked for \"{$conflict->name}\" during that time. Please choose a different time or location.",
                ], 422);
            }
        }

        $originalMessage = $event->notification_message;
        $originalMembershipIds = $event->membership_ids ?? [];
        $newMembershipIds = $request->membership_ids ?? [];
        $membershipChanged = $originalMembershipIds != $newMembershipIds;

        // Track the details residents actually rely on -- schedule and
        // venue -- not just the notification message, so a rescheduled or
        // moved event re-notifies people too (see $scheduleOrVenueChanged below).
        $originalEventStart = optional($event->event_start)->toDateTimeString();
        $originalLocation = $event->location;

        DB::beginTransaction();

        try {
            $event->update([
                'name'                 => $request->name,
                'description'          => $request->description,
                'location'             => $request->location,
                'event_start'          => $request->event_start,
                'event_end'            => $request->event_end,
                'call_time_start'      => $request->call_time_start,
                'call_time_end'        => $request->call_time_end,
                'membership_ids'       => $newMembershipIds,
                'notification_message' => $request->notification_message,
                'approved_budget'      => $request->approved_budget,
            ]);

            // Undo the event's previous borrow (returns quantity to Inventory),
            // then apply whatever the form submitted now -- simplest way to
            // handle add/remove/quantity-change without diffing item-by-item.
            // Not a real-world return, so it doesn't go on the Returns
            // page's release log (see releaseBorrowedItems()'s doc comment).
            $this->releaseBorrowedItems($event, logRelease: false);
            $this->applyBorrowedItems($event, $request->borrowed_items ?? []);

            if ($membershipChanged) {
                $event->syncAttendanceRecords();
            }

            $notificationUpdated = false;

            // A rescheduled date/time or a changed venue matters just as
            // much to attendees as an edited message -- previously only
            // the message was checked here.
            $scheduleOrVenueChanged = $originalEventStart != optional($event->event_start)->toDateTimeString()
                || $originalLocation != $event->location;
            $messageChanged = $originalMessage != $request->notification_message;

            if ($messageChanged || $scheduleOrVenueChanged) {
                $this->sendEventNotifications($event, true);
                $notificationUpdated = true;
            }

            // Adviser recommendation: "2 in 1 — Facebook Page" -- re-post a
            // correction to the Page whenever a resident-visible detail
            // actually changed (schedule, venue, or the notification
            // message) AND the event was originally announced on Facebook
            // at create time. Events that were never posted to Facebook
            // stay silent on edit, even if their schedule changes. Title is
            // different from the create-time post ("Event Updated:" instead
            // of "New Event:"), so followers immediately understand this
            // is a correction/reminder, not a duplicate announcement.
            if ($event->posted_to_facebook && ($scheduleOrVenueChanged || $messageChanged)) {
                $facebookBody = trim(
                    ($event->description ?: '') .
                    ($event->notification_message ? "\n\n" . $event->notification_message : '') .
                    "\n\n" . $this->eventScheduleLine($event, 'facebook')
                );

                [$fbOk, $fbMessage] = app(FacebookService::class)->postEvent(
                    'Event Updated: ' . $event->name,
                    $facebookBody
                );
                if (!$fbOk) {
                    \Illuminate\Support\Facades\Log::warning('Facebook update post failed: ' . $fbMessage, ['event' => $event->name]);
                }
            }

            DB::commit();

            $this->createLog('Update', 'Events', "Updated event: {$event->name}", now()->addMilliseconds(500));

            if ($notificationUpdated) {
                $this->createLog('Update', 'Notifications', "Updated notification for event: {$event->name}", now()->addMilliseconds(500));
            }

            return response()->json([
                'message' => 'Event updated successfully',
                'event'   => $event->load('borrowedItems.inventoryItem'),
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
        // Only Staff archive events -- same reasoning as store() above.
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = auth()->user();

        // ✅ Find only active (non-deleted) events
        $event = Event::withoutTrashed()->findOrFail($id);
        $eventName = $event->name;

        // Ongoing/Past events are locked -- same rule as update() above.
        if ($this->isEventOngoing($event)) {
            return response()->json([
                'message' => "\"{$eventName}\" is currently ongoing and can't be archived until it ends.",
            ], 409);
        }

        if ($event->event_end && now()->gt($event->event_end)) {
            return response()->json([
                'message' => "\"{$eventName}\" has already ended and can't be archived.",
            ], 409);
        }

        DB::beginTransaction();

        try {
            // ✅ Record who archived before soft deleting
            $event->deleted_by = $user->user_code;
            $event->save();

            // ✅ Return any borrowed inventory items -- an archived event no
            // longer needs them out on loan.
            $this->releaseBorrowedItems($event);

            // ✅ Step 1: Soft delete the event (sets deleted_at timestamp)
            $event->delete();

            // ✅ Step 2: Update notifications to show event was cancelled
            // Only the members' announcements -- staff alerts and staff replies
            // keep their own type.
            Notification::where('event_id', $id)
                ->whereIn('type', ['event_announcement', 'event_updated'])
                ->update([
                    'type' => 'event_deleted',
                    'title' => '❌ Event Cancelled: ' . $eventName,
                    'message' => 'We apologize for the inconvenience. This event has been cancelled.',
                    'is_updated' => true,
                    'read' => false,
                    'updated_at_notification' => now(),
                    'updated_at' => now(),
                ]);

            // ✅ Step 3: Log the archive action
            $this->createLog('Archive Event', 'Events', "Archived event: {$eventName}");

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
        // Only Staff restore archived events -- same reasoning as store() above.
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = auth()->user();

        $event = Event::onlyTrashed()->findOrFail($id);
        $eventName = $event->name;

        try {
            // ✅ Clear the deleted_by when restoring
            $event->deleted_by = null;
            $event->save();

            $event->restore();

            $this->createLog('Restore Event', 'Events', "Restored event from archive: {$eventName}");

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
        // Permanent deletion is switched off for everyone, Head Staff included.
        return response()->json(['message' => 'Permanent deletion is disabled. Events are archived and kept.'], 403);

        // --- previous implementation, intentionally unreachable ---
        // Only Staff permanently delete events -- same reasoning as store()
        // above, but higher stakes: this wipes the event and its
        // notifications/attendance/inventory records with no recovery.
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = auth()->user();

        // ✅ Find soft-deleted event
        $event = Event::onlyTrashed()->findOrFail($id);
        $eventName = $event->name;

        DB::beginTransaction();

        try {
            // Permanently delete notifications, attendance, and any
            // leftover borrow records (quantities were already returned to
            // Inventory when the event was archived, via destroy()).
            Notification::where('event_id', $id)->forceDelete();
            EventAttendance::where('event_id', $id)->forceDelete();
            EventInventoryItem::where('event_id', $id)->delete();

            // Permanently delete event
            $event->forceDelete();

            $this->createLog('Force Delete', 'Events', "Permanently deleted event: {$eventName}");

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

        // Eligible residents -- still used below for IN-APP notifications.
        // Not used for the SMS blast anymore (that goes to all heads).
        $residents = User::where('role', 'Resident')
            ->whereIn('id', $userIds)
            ->with('household:id,contact_number')
            ->get(['id', 'first_name', 'last_name', 'contact_number', 'household_id', 'household_code', 'is_household_head', 'household_contact_number']);

        $smsPrefix = $isUpdate ? 'UPDATED: ' : '';

        // Message + compact schedule line. SMS is length-sensitive (one
        // segment ~160 chars), so the schedule uses short forms
        // ("Oct 14, sign-in 6:00 AM, event 7:00 AM-11:00 AM"), and the
        // notification_message is kept short.
        $smsMessage = $smsPrefix . trim(
            $event->name
            . ' — ' . ($event->notification_message ?? 'New event announced by Barangay Piao.')
            . ' — ' . $this->eventScheduleLine($event, 'sms')
        );

        // Broadcast the SMS to EVERY household head in the barangay, not
        // just heads of households that matched this event's membership
        // targeting. The in-app notifications further below still only go
        // to the eligible residents -- this SMS blast is intentionally
        // broader than that, so a head with no personal stake in the event
        // still gets it and can relay the info to neighbors.
        app(SmsService::class)->broadcastToAllHouseholdHeads($event->id, $smsMessage);

        // --- In-app notifications (unchanged) ---
        $staff = auth()->user();
        $staffName = 'Staff: ' . $staff->last_name;

        $title = $isUpdate
            ? 'Event Updated: ' . $event->name
            : 'New Event: ' . $event->name;

        $messageWithStaff = $staffName . ' • ' . $event->name . ' — ' .
            ($event->notification_message ?? 'New event announced');

        foreach ($userIds as $userId) {
            if ($isUpdate) {
                // Only the event's own announcement is re-used -- never a staff
                // reply / heart the member received about their feedback.
                $notification = Notification::where('user_id', $userId)
                    ->where('event_id', $event->id)
                    ->whereIn('type', ['event_announcement', 'event_updated'])
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

    // ===== Borrow items from Inventory for an Event (deduct on
    // create/edit, return on edit/archive) =====

    /**
     * Deducts each requested quantity from Inventory and records a borrow
     * row per item. Throws (caller is expected to be inside a DB
     * transaction) if any item doesn't have enough stock left.
     */
    private function applyBorrowedItems(Event $event, array $items): void
    {
        $labels = array_keys(InventoryItem::CONDITION_COLUMNS);

        foreach ($items as $bi) {
            // Staff choose which units to borrow (e.g. 10 Good + 5 New). When
            // they do, exactly those come out of stock and go back to the
            // same conditions on return. Without it (older callers) the
            // quantity is taken from the item's main condition.
            $units = null;
            if (!empty($bi['conditions']) && is_array($bi['conditions'])) {
                $units = [];
                foreach ($labels as $label) {
                    $units[$label] = max(0, (int) ($bi['conditions'][$label] ?? 0));
                }
                if (array_sum($units) <= 0) {
                    $units = null;
                }
            }

            $quantity = $units ? array_sum($units) : (int) ($bi['quantity'] ?? 0);
            if ($quantity <= 0) {
                continue;
            }

            $item = InventoryItem::findOrFail((int) $bi['inventory_item_id']);

            if ($item->quantity < $quantity) {
                throw new \Exception("Not enough stock for \"{$item->name}\" (available: {$item->quantity}, requested: {$quantity}).");
            }

            if ($units) {
                $short = $item->shortfall($units);
                if ($short) {
                    $have = $item->conditionCounts();
                    $label = array_key_first($short);
                    throw new \Exception("Not enough {$label} stock for \"{$item->name}\" (available: {$have[$label]}, requested: {$units[$label]}).");
                }
                $item->takeUnits($units);
            } else {
                $item->quantity -= $quantity;
                $item->save();
            }

            $borrow = new EventInventoryItem([
                'event_id'           => $event->id,
                'inventory_item_id'  => $item->id,
                'quantity'           => $quantity,
            ]);
            if ($units) {
                $borrow->setUnits($units);
            }
            $borrow->save();
        }
    }

    /**
     * @param bool $logRelease Whether this counts as a real "item came
     * back" release worth logging for the Returns page's Undo trail.
     * true for archiving an event and for the dashboard's one-click
     * "release everything" -- both genuinely give items back. false for
     * the edit flow below, which tears the borrow list down purely to
     * rebuild it from the submitted form and isn't a real-world return.
     */
    private function releaseBorrowedItems(Event $event, bool $logRelease = true): void
    {
        $touchedItems = [];
        foreach ($event->borrowedItems()->get() as $borrowed) {
            $item = InventoryItem::withTrashed()->find($borrowed->inventory_item_id);
            // The borrowed units go back into the same conditions they came from.
            $units = $borrowed->resolvedUnits($item->condition ?? 'Good');
            if ($item) {
                $touchedItems[$item->id] = $item;
                $item->giveUnits($units);
            }

            if ($logRelease) {
                $log = new EventInventoryRelease([
                    'event_id' => $event->id,
                    'inventory_item_id' => $borrowed->inventory_item_id,
                    'quantity' => $borrowed->quantity,
                    'released_by' => auth()->user()?->user_code,
                ]);
                $log->setUnits($units);
                $log->save();
            }
        }

        $event->borrowedItems()->delete();

        foreach ($touchedItems as $touched) {
            $touched->settleLostOnLoan();
        }
    }

    /**
     * Events that have already ended but still have borrowed items nobody
     * released. Pairs with the item-level "Overdue Return" flag on the
     * Inventory grid (see InventoryController::index) -- that one lets
     * staff notice a single stuck item; this one is the event-level view
     * for the Dashboard, so staff can release everything a given event
     * is still holding in one action instead of hunting it down later.
     */
    public function overdueBorrows()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $events = Event::withoutTrashed()
            ->whereHas('borrowedItems')
            ->with(['borrowedItems.inventoryItem:id,name,condition'])
            ->get()
            ->filter(function ($event) {
                $endedAt = $event->event_end ?? $event->event_start;
                return $endedAt && $endedAt->isPast();
            })
            ->map(function ($event) {
                return [
                    'id' => $event->id,
                    'name' => $event->name,
                    'ended_at' => $event->event_end ?? $event->event_start,
                    'items' => $event->borrowedItems->map(fn ($b) => [
                        'id' => $b->id,
                        'name' => $b->inventoryItem->name ?? 'Unknown item',
                        'quantity' => $b->quantity,
                        // Units still out, per condition (what the return form starts from).
                        'units' => $b->resolvedUnits($b->inventoryItem->condition ?? 'Good'),
                    ])->values(),
                ];
            })
            ->values();

        return response()->json($events);
    }

    /**
     * Everything this event took from Inventory, for the event's Inventory
     * tab: per item, how many units (by condition) are still out, how many
     * came back (and in what condition), plus each return on record.
     */
    public function eventInventory($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event = Event::withoutTrashed()->findOrFail($id);

        $labels = array_keys(InventoryItem::CONDITION_COLUMNS);
        $zero = array_fill_keys($labels, 0);

        $out = $event->borrowedItems()->with('inventoryItem')->get();
        $releases = EventInventoryRelease::where('event_id', $event->id)
            ->whereNull('undone_at')
            ->with('inventoryItem')
            ->orderBy('created_at')
            ->get();

        $items = [];
        $touch = function ($itemId, $name, $photo = null) use (&$items, $zero) {
            return $items[$itemId] ??= [
                'inventory_item_id' => $itemId,
                'name' => $name ?? 'Unknown item',
                'photo_url' => $photo,
                'out' => 0, 'out_units' => $zero,
                'returned' => 0, 'returned_units' => $zero,
            ];
        };

        foreach ($out as $b) {
            $row = $touch($b->inventory_item_id, $b->inventoryItem->name ?? null, $b->inventoryItem->photo_url ?? null);
            $units = $b->resolvedUnits($b->inventoryItem->condition ?? 'Good');
            $row['out'] += $b->quantity;
            foreach ($units as $label => $n) {
                $row['out_units'][$label] += $n;
            }
            $items[$b->inventory_item_id] = $row;
        }

        foreach ($releases as $r) {
            $row = $touch($r->inventory_item_id, $r->inventoryItem->name ?? null, $r->inventoryItem->photo_url ?? null);
            $units = $r->resolvedUnits($r->inventoryItem->condition ?? 'Good');
            $row['returned'] += $r->quantity;
            foreach ($units as $label => $n) {
                $row['returned_units'][$label] += $n;
            }
            $items[$r->inventory_item_id] = $row;
        }

        $items = collect($items)->map(function ($row) {
            $row['total'] = $row['out'] + $row['returned'];
            $row['status'] = $row['out'] === 0 ? 'returned' : ($row['returned'] > 0 ? 'partial' : 'borrowed');

            return $row;
        })->sortBy('name')->values();

        return response()->json([
            'items' => $items,
            'returns' => $releases->map(fn ($r) => [
                'id' => $r->id,
                'name' => $r->inventoryItem->name ?? 'Unknown item',
                'quantity' => $r->quantity,
                'units' => $r->resolvedUnits($r->inventoryItem->condition ?? 'Good'),
                'released_by' => $r->released_by,
                'released_at' => $r->created_at,
                'photo_url' => $r->inventoryItem->photo_url ?? null,
                'evidence_photo_urls' => $r->evidence_photo_urls,
            ])->reverse()->values(),
        ]);
    }

    /**
     * One-click release for the Dashboard's overdue-borrows card: returns
     * every item this event still holds to Inventory, same as archiving
     * would, but without archiving the event itself -- staff may still
     * want the event record active (for reports, history, etc.) even
     * after giving back what it borrowed.
     */
    public function returnBorrowedItems($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event = Event::withoutTrashed()->findOrFail($id);

        if ($event->borrowedItems()->count() === 0) {
            return response()->json(['message' => 'This event has no borrowed items to return.'], 422);
        }

        $this->releaseBorrowedItems($event);
        $this->createLog('Return Items', 'Inventory', "Returned borrowed items from event: {$event->name}");

        return response()->json(['message' => 'Borrowed items returned to Inventory.']);
    }

    /**
     * Release a single borrowed item back to Inventory, instead of an
     * event's entire bundle at once (see returnBorrowedItems() above for
     * the all-at-once version, still used internally by archive/edit).
     * Staff may only want to give back some of what an event borrowed --
     * e.g. the chairs are free again but the sound system is still in use
     * elsewhere -- so each item on the Returns page releases on its own.
     */
    public function releaseBorrowedItem(Request $request, $eventId, $borrowId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event = Event::withoutTrashed()->findOrFail($eventId);
        $borrow = $event->borrowedItems()->where('id', $borrowId)->firstOrFail();

        // Staff can give back fewer than the full quantity -- e.g. 1 of
        // the 3 borrowed blood pressure monitors is free again, the other
        // 2 are still out. Defaults to the full remaining quantity so the
        // request is optional, not required, from any other caller.
        // An evidence photo (proof the item physically came back) is
        // required on every release -- see EventInventoryRelease::evidence_photo_url.
        $request->validate([
            'quantity' => 'nullable|integer|min:1|max:' . $borrow->quantity,
            // Condition each returned unit comes back in, e.g. Good => 2, Poor => 1.
            // When sent, their sum is the quantity returned.
            'conditions' => 'nullable|array',
            'conditions.*' => 'integer|min:0',
            // One or more evidence photos (first = cover), up to 5.
            'photos' => 'required_without:photo|array|min:1|max:5',
            'photos.*' => 'image|max:5120',
            'photo' => 'required_without:photos|image|max:5120',
        ]);
        $releaseQty = $request->filled('quantity') ? (int) $request->quantity : $borrow->quantity;

        $item = InventoryItem::withTrashed()->find($borrow->inventory_item_id);
        $mainCondition = $item->condition ?? 'Good';

        // Staff say which condition each returned unit comes back in
        // (e.g. 3 Good + 1 Poor if one got damaged). Without that, a full
        // return gives back exactly what was borrowed and a partial one takes
        // from the largest condition first.
        $returned = null;
        if (is_array($request->input('conditions'))) {
            $returned = [];
            foreach (array_keys(InventoryItem::CONDITION_COLUMNS) as $label) {
                $returned[$label] = max(0, (int) ($request->input("conditions.{$label}") ?? 0));
            }
            if (array_sum($returned) <= 0) {
                $returned = null;
            }
        }

        if ($returned) {
            $releaseQty = array_sum($returned);
            if ($releaseQty > $borrow->quantity) {
                return response()->json([
                    'message' => "Can't return {$releaseQty} -- only {$borrow->quantity} of this item is out on loan.",
                ], 422);
            }
            $borrow->takeOutMatching($returned, $mainCondition);
            $releasedUnits = $returned;
        } else {
            $releasedUnits = $borrow->takeOutUnits($releaseQty, $mainCondition);
        }
        $item?->giveUnits($releasedUnits);

        $itemName = $item->name ?? 'item';

        if ($borrow->quantity <= 0) {
            $borrow->delete();
        } else {
            $borrow->save();
        }

        // Units reported lost while out on loan are settled here once nothing
        // real is left to return (see InventoryItem::settleLostOnLoan).
        $item?->settleLostOnLoan();

        if ($request->hasFile('photos')) {
            $evidence = PhotoSet::resolve([], $request, fn ($f) => $this->localUpload($f, 'release_evidence_photos'))['final'];
        } else {
            $evidence = [$this->localUpload($request->file('photo'), 'release_evidence_photos')];
        }

        $release = new EventInventoryRelease([
            'event_id' => $event->id,
            'inventory_item_id' => $borrow->inventory_item_id,
            'quantity' => $releaseQty,
            'released_by' => auth()->user()?->user_code,
            'evidence_photo_path' => $evidence[0] ?? null,
            'extra_evidence_photo_paths' => count($evidence) > 1 ? array_slice($evidence, 1) : null,
        ]);
        $release->setUnits($releasedUnits);
        $release->save();

        $this->createLog('Return Items', 'Inventory', "Returned {$releaseQty}x {$itemName} from event: {$event->name}");

        return response()->json([
            'message' => 'Item returned to Inventory.',
            'released_quantity' => $releaseQty,
            'release_id' => $release->id,
        ]);
    }

    /**
     * Releases from roughly the last two weeks, across every event, newest
     * first -- the "Undo" trail for the Returns page. Two weeks is plenty
     * of room for "wait, I released the wrong amount earlier today/this
     * week" without turning this into a permanent audit log browser (that
     * job belongs to Activity Logs). Paginated (like the overdue-borrows
     * table above it) rather than a flat 30-row cap, so older-but-still-
     * recent releases stay reachable instead of just falling off the end.
     */
    public function recentReleases(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $perPage = 5;
        $page = max(1, (int) $request->query('page', 1));
        $search = trim((string) $request->query('search', ''));

        $base = EventInventoryRelease::whereNull('undone_at')
            ->where('created_at', '>=', now()->subDays(14));

        // Matches the same free-text search the overdue-events table above
        // uses (event name or item name) -- so typing something like
        // "folding" finds it here too, even once every matching event has
        // already been fully released and dropped out of that table.
        if ($search !== '') {
            $base->where(function ($query) use ($search) {
                $query->whereHas('event', fn ($q) => $q->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('inventoryItem', fn ($q) => $q->where('name', 'like', "%{$search}%"));
            });
        }

        $total = (clone $base)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($page, $lastPage);

        $rows = $base->with(['event:id,name', 'inventoryItem:id,name,condition'])
            ->latest()
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get();

        // How much of each item the event still has out -- the Edit Return
        // form lets staff raise a release up to (already released + still
        // borrowed), so it needs that ceiling up front.
        $stillBorrowed = EventInventoryItem::whereIn('event_id', $rows->pluck('event_id')->unique())
            ->whereIn('inventory_item_id', $rows->pluck('inventory_item_id')->unique())
            ->get()
            ->groupBy(fn ($b) => $b->event_id . '-' . $b->inventory_item_id)
            ->map(fn ($group) => (int) $group->sum('quantity'));

        // Units still out per condition, so Edit Return can cap each condition.
        $stillOutUnits = EventInventoryItem::with('inventoryItem:id,condition')
            ->whereIn('event_id', $rows->pluck('event_id')->unique())
            ->whereIn('inventory_item_id', $rows->pluck('inventory_item_id')->unique())
            ->get()
            ->groupBy(fn ($b) => $b->event_id . '-' . $b->inventory_item_id)
            ->map(function ($group) {
                $sum = array_fill_keys(array_keys(InventoryItem::CONDITION_COLUMNS), 0);
                foreach ($group as $b) {
                    foreach ($b->resolvedUnits($b->inventoryItem->condition ?? 'Good') as $label => $n) {
                        $sum[$label] += $n;
                    }
                }
                return $sum;
            });

        $releases = $rows->map(function ($r) use ($stillBorrowed, $stillOutUnits) {
            $main = $r->inventoryItem->condition ?? 'Good';
            $units = $r->resolvedUnits($main);
            $out = $stillOutUnits[$r->event_id . '-' . $r->inventory_item_id] ?? array_fill_keys(array_keys($units), 0);
            $maxUnits = [];
            foreach ($units as $label => $n) {
                $maxUnits[$label] = $n + ($out[$label] ?? 0);
            }

            return [
                'id' => $r->id,
                'event_id' => $r->event_id,
                'event_name' => $r->event?->name ?? 'Deleted event',
                'item_name' => $r->inventoryItem->name ?? 'Unknown item',
                'quantity' => $r->quantity,
                // Condition each returned unit came back in.
                'units' => $units,
                'max_units' => $maxUnits,
                'max_quantity' => $r->quantity + ($stillBorrowed[$r->event_id . '-' . $r->inventory_item_id] ?? 0),
                'released_by' => $r->released_by,
                'released_at' => $r->created_at,
                'evidence_photo_url' => $r->evidence_photo_url,
                'evidence_photo_urls' => $r->evidence_photo_urls,
            ];
        });

        return response()->json([
            'data' => $releases,
            'current_page' => $page,
            'last_page' => $lastPage,
            'total' => $total,
        ]);
    }

    /**
     * Reverses a single release: puts the quantity back on the event's
     * borrow record (re-creating it if the release had zeroed it out and
     * deleted the row) and takes it back out of Inventory's available
     * stock. This is the fix for "I released 3 but only meant to release
     * 2" -- undo the mistaken release of 3, then release 2 properly.
     */
    public function undoRelease(Request $request, $releaseId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Moving a release back to Pending doesn't need a second photo -- the
        // release already carries its own evidence. One can still be sent
        // with the request, but it's optional.
        $request->validate([
            'photo' => 'nullable|image|max:5120',
        ]);

        $release = EventInventoryRelease::whereNull('undone_at')->findOrFail($releaseId);
        $event = Event::withoutTrashed()->find($release->event_id);

        if (!$event) {
            return response()->json(['message' => 'That event no longer exists, so this release can\'t be undone.'], 422);
        }

        // Undo doesn't have to be all-or-nothing -- if only some of what
        // was released was the actual mistake (released 2, meant 1), the
        // rest of it can stay released. Defaults to the whole thing when
        // no quantity is given, and is clamped to what's left on this
        // release record either way.
        $requestedQty = (int) $request->input('quantity', $release->quantity);
        $requestedQty = max(1, min($requestedQty, $release->quantity));

        $item = InventoryItem::withTrashed()->find($release->inventory_item_id);

        // If some of what this release put back into stock has already
        // been lent out again (to this event or another one) in the
        // meantime, there may not be enough of it sitting in Inventory
        // to take back -- undoing anyway would push the count negative.
        // The units taken back are the ones this release returned (same
        // conditions), so each has to still be in stock.
        $mainCondition = $item->condition ?? 'Good';
        $undoUnits = $release->takeOutUnits($requestedQty, $mainCondition);

        if ($item && ($item->quantity < $requestedQty || $item->shortfall($undoUnits))) {
            return response()->json([
                'message' => "Can't undo -- only {$item->quantity} of this item is left in Inventory now. Some of it may have already been lent out again since it was released.",
            ], 422);
        }

        $borrow = $event->borrowedItems()->where('inventory_item_id', $release->inventory_item_id)->first();
        if (!$borrow) {
            $borrow = new EventInventoryItem([
                'event_id' => $event->id,
                'inventory_item_id' => $release->inventory_item_id,
                'quantity' => 0,
            ]);
        }
        $borrow->addUnits($undoUnits, $mainCondition);
        $borrow->save();

        $item?->takeUnits($undoUnits);

        $undoPhotoPath = null;
        if ($request->hasFile('photo')) {
            $undoPhotoPath = $this->localUpload($request->file('photo'), 'release_undo_photos');

            // Replace any earlier undo photo pointer on this same release row --
            // a convenience for anything that just wants "the latest undo
            // evidence for this release" without joining through the log table.
            // The full per-action record (every undo, including earlier partial
            // ones) lives in event_inventory_release_undos, created below.
            $this->localDelete($release->undo_photo_path);
            $release->undo_photo_path = $undoPhotoPath;
        }

        // Shrink this release record by however much of it was just
        // undone; once nothing is left of it, mark it fully undone so it
        // drops off the Recently Released list. A partial undo leaves the
        // record showing the remaining (still genuinely released) amount.
        // (takeOutUnits above already took $requestedQty off this record.)
        if ($release->quantity <= 0) {
            $release->quantity = 0;
            $release->undone_at = now();
        }
        $release->save();

        // One row per Undo click -- see EventInventoryReleaseUndo's own
        // doc comment for why this is a separate log rather than a single
        // field on the release. This is what the Returns page's "Recently
        // Undone" record reads.
        EventInventoryReleaseUndo::create([
            'event_inventory_release_id' => $release->id,
            'quantity' => $requestedQty,
            'undone_by' => auth()->user()?->user_code,
            'photo_path' => $undoPhotoPath,
        ]);

        $itemName = $item->name ?? 'item';
        $this->createLog('Undo Return', 'Inventory', "Undid return of {$requestedQty}x {$itemName} for event: {$event->name}");

        return response()->json(['message' => 'Release undone -- the item is marked borrowed again.']);
    }

    /**
     * Edits a release in place -- the "fix it right where it is" path for a
     * mis-entered return, instead of undoing it and releasing again:
     *  - quantity: lower it and the difference goes back to the event's
     *    borrowed items (and out of Inventory's stock); raise it and the
     *    extra is taken from what the event still has borrowed.
     *  - photo: optional; when sent it REPLACES the saved evidence photo
     *    (the old file is deleted), when omitted the existing one is kept.
     */
    public function updateRelease(Request $request, $releaseId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $release = EventInventoryRelease::whereNull('undone_at')->findOrFail($releaseId);
        $event = Event::withoutTrashed()->find($release->event_id);

        if (!$event) {
            return response()->json(['message' => 'That event no longer exists, so this return can\'t be edited.'], 422);
        }

        $borrow = $event->borrowedItems()->where('inventory_item_id', $release->inventory_item_id)->first();
        $maxQty = $release->quantity + ($borrow?->quantity ?? 0);

        $request->validate([
            'quantity' => 'nullable|integer|min:1|max:' . $maxQty,
            'photo' => 'nullable|image|max:5120',
            // The whole evidence-photo list: keep_photos[] = indexes of the
            // saved photos to keep (cover first), photos[] = new files.
            'photos_sync' => 'nullable|boolean',
            'photos' => 'nullable|array|max:5',
            'photos.*' => 'image|max:5120',
            'keep_photos' => 'nullable|array',
            'keep_photos.*' => 'integer|min:0',
            'conditions' => 'nullable|array',
            'conditions.*' => 'nullable|integer|min:0',
        ]);

        // Validate the photo list up front (nothing is uploaded or changed
        // yet): a return always keeps at least one evidence photo, max 5.
        if ($request->boolean('photos_sync')) {
            $plan = PhotoSet::plan($release->allEvidencePhotoPaths(), $request);
            if (count($plan['kept']) + count($plan['files']) === 0) {
                return response()->json(['message' => 'A return needs at least one evidence photo.'], 422);
            }
        }

        $item = InventoryItem::withTrashed()->find($release->inventory_item_id);
        $mainCondition = $item->condition ?? 'Good';

        $current = $release->resolvedUnits($mainCondition);
        $stillOut = $borrow ? $borrow->resolvedUnits($mainCondition) : array_fill_keys(array_keys($current), 0);

        // Staff may pick exactly how many units came back in each condition
        // (conditions[New|Good|Fair|Poor]); otherwise only the total changes.
        $target = null;
        if ($request->has('conditions')) {
            $target = [];
            foreach (array_keys($current) as $label) {
                $target[$label] = max(0, (int) ($request->input("conditions.{$label}") ?? 0));
                if ($target[$label] > $current[$label] + ($stillOut[$label] ?? 0)) {
                    return response()->json([
                        'message' => "Only " . ($current[$label] + ($stillOut[$label] ?? 0)) . " {$label} unit(s) of this item belong to this return.",
                    ], 422);
                }
            }
            if (array_sum($target) < 1) {
                return response()->json(['message' => 'A return needs at least one unit.'], 422);
            }
            $newQty = array_sum($target);
        } else {
            $newQty = $request->filled('quantity') ? (int) $request->quantity : $release->quantity;
        }
        $delta = $newQty - $release->quantity; // < 0: send back to pending, > 0: release more

        if ($target !== null) {
            $backUnits = [];
            $moreUnits = [];
            foreach ($target as $label => $n) {
                $backUnits[$label] = max(0, $current[$label] - $n);
                $moreUnits[$label] = max(0, $n - $current[$label]);
            }
        } else {
            $backUnits = $delta < 0 ? $release->takeOutUnits(-$delta, $mainCondition) : [];
            $moreUnits = null;
        }

        $backTotal = array_sum($backUnits);
        if ($backTotal > 0) {
            if ($item && ($item->quantity < $backTotal || $item->shortfall($backUnits))) {
                return response()->json([
                    'message' => "Can't lower this -- not enough of those units are left in Inventory now. Some of it may have already been lent out again since it was released.",
                ], 422);
            }

            if (!$borrow) {
                $borrow = new EventInventoryItem([
                    'event_id' => $event->id,
                    'inventory_item_id' => $release->inventory_item_id,
                    'quantity' => 0,
                ]);
            }
            $borrow->addUnits($backUnits, $mainCondition);
            $borrow->save();

            $item?->takeUnits($backUnits);
        }

        if ($target !== null) {
            if (array_sum($moreUnits) > 0) {
                // Exactly these units come out of what is still borrowed.
                $left = $borrow->resolvedUnits($mainCondition);
                foreach ($moreUnits as $label => $n) {
                    $left[$label] = max(0, ($left[$label] ?? 0) - $n);
                }
                $borrow->setUnits($left);
                if ($borrow->quantity <= 0) {
                    $borrow->delete();
                } else {
                    $borrow->save();
                }
                $item?->giveUnits($moreUnits);
            }
            $release->setUnits($target);
        } elseif ($delta > 0) {
            // $borrow is guaranteed by the max rule above ($delta <= its quantity).
            $moreUnits = $borrow->takeOutUnits($delta, $mainCondition);
            if ($borrow->quantity <= 0) {
                $borrow->delete();
            } else {
                $borrow->save();
            }

            $item?->giveUnits($moreUnits);
            $release->addUnits($moreUnits, $mainCondition);
        }

        if ($request->boolean('photos_sync')) {
            $res = PhotoSet::resolve($release->allEvidencePhotoPaths(), $request, fn ($f) => $this->localUpload($f, 'release_evidence_photos'));
            $release->evidence_photo_path = $res['final'][0];
            $release->extra_evidence_photo_paths = count($res['final']) > 1 ? array_slice($res['final'], 1) : null;
            foreach ($res['removed'] as $gone) {
                $this->localDelete($gone);
            }
        } elseif ($request->hasFile('photo')) {
            $this->localDelete($release->evidence_photo_path);
            $release->evidence_photo_path = $this->localUpload($request->file('photo'), 'release_evidence_photos');
        }

        $release->quantity = $newQty;
        $release->save();

        $itemName = $item->name ?? 'item';
        $this->createLog('Edit Return', 'Inventory', "Edited return of {$itemName} for event: {$event->name} -- now {$newQty} returned");

        return response()->json([
            'message' => 'Return updated.',
            'quantity' => $newQty,
            'moved_back_to_pending' => $delta < 0 ? -$delta : 0,
        ]);
    }

    /**
     * Undo actions from roughly the last two weeks, across every event,
     * newest first -- the permanent "who undid what" record for the
     * Returns page, same shape and lookback window as recentReleases()
     * above. Unlike that list (which only shows releases still eligible to
     * be undone), this one never empties out an entry -- undoing is the
     * thing being logged here, not something still pending an action.
     */
    public function recentUndos(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $perPage = 5;
        $page = max(1, (int) $request->query('page', 1));
        $search = trim((string) $request->query('search', ''));

        $base = EventInventoryReleaseUndo::where('created_at', '>=', now()->subDays(14));

        if ($search !== '') {
            $base->where(function ($query) use ($search) {
                $query->whereHas('release.event', fn ($q) => $q->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('release.inventoryItem', fn ($q) => $q->where('name', 'like', "%{$search}%"));
            });
        }

        $total = (clone $base)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($page, $lastPage);

        $undos = $base->with(['release.event:id,name', 'release.inventoryItem:id,name'])
            ->latest()
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get()
            ->map(fn ($u) => [
                'id' => $u->id,
                'event_name' => $u->release?->event?->name ?? 'Deleted event',
                'item_name' => $u->release?->inventoryItem?->name ?? 'Unknown item',
                'quantity' => $u->quantity,
                'undone_by' => $u->undone_by,
                'undone_at' => $u->created_at,
                'photo_url' => $u->photo_url,
            ]);

        return response()->json([
            'data' => $undos,
            'current_page' => $page,
            'last_page' => $lastPage,
            'total' => $total,
        ]);
    }
}
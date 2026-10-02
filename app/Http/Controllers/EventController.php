<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use App\Models\EventAttendance;
use App\Models\EventInventoryItem;
use App\Models\EventInventoryRelease;
use App\Models\InventoryItem;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Services\SmsService;
use App\Services\FacebookService;

class EventController extends Controller
{
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
                app(FacebookService::class)->postEvent(
                    'New Event: ' . $event->name,
                    $event->notification_message ?? $event->description
                );
            }

            DB::commit();

            $this->createLog('Create', 'Events', "Created event: {$event->name}");

            if (!empty($event->notification_message)) {
                $this->createLog('Create', 'Notifications', "Sent notification for event: {$event->name}", now()->addMilliseconds(500));
            }

            return response()->json([
                'message' => 'Event created successfully',
                'event'   => $event->load('borrowedItems.inventoryItem'),
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
        // moved event re-notifies people too (see $meaningfulChange below).
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
            Notification::where('event_id', $id)->update([
                'type' => 'event_deleted',
                'title' => '❌ Event Cancelled: ' . $eventName,
                'message' => 'We apologize for the inconvenience. This event has been cancelled.',
                'is_updated' => true,
                'read' => false,
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
        $smsMessage = $smsPrefix . trim($event->name . ' — ' . ($event->notification_message ?? 'New event announced by Barangay Piao.'));

        // === THE ONLY LINE THAT CHANGED ===
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

    // ===== Borrow items from Inventory for an Event (deduct on
    // create/edit, return on edit/archive) =====

    /**
     * Deducts each requested quantity from Inventory and records a borrow
     * row per item. Throws (caller is expected to be inside a DB
     * transaction) if any item doesn't have enough stock left.
     */
    private function applyBorrowedItems(Event $event, array $items): void
    {
        foreach ($items as $bi) {
            $quantity = (int) ($bi['quantity'] ?? 0);
            if ($quantity <= 0) {
                continue;
            }

            $item = InventoryItem::findOrFail((int) $bi['inventory_item_id']);

            if ($item->quantity < $quantity) {
                throw new \Exception("Not enough stock for \"{$item->name}\" (available: {$item->quantity}, requested: {$quantity}).");
            }

            $item->quantity -= $quantity;
            $item->save();

            EventInventoryItem::create([
                'event_id'           => $event->id,
                'inventory_item_id'  => $item->id,
                'quantity'           => $quantity,
            ]);
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
        foreach ($event->borrowedItems()->get() as $borrowed) {
            $item = InventoryItem::withTrashed()->find($borrowed->inventory_item_id);
            if ($item) {
                $item->quantity += $borrowed->quantity;
                $item->save();
            }

            if ($logRelease) {
                EventInventoryRelease::create([
                    'event_id' => $event->id,
                    'inventory_item_id' => $borrowed->inventory_item_id,
                    'quantity' => $borrowed->quantity,
                    'released_by' => auth()->user()?->user_code,
                ]);
            }
        }

        $event->borrowedItems()->delete();
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
            ->with(['borrowedItems.inventoryItem:id,name'])
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
                    ])->values(),
                ];
            })
            ->values();

        return response()->json($events);
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
        $request->validate([
            'quantity' => 'nullable|integer|min:1|max:' . $borrow->quantity,
        ]);
        $releaseQty = $request->filled('quantity') ? (int) $request->quantity : $borrow->quantity;

        $item = InventoryItem::withTrashed()->find($borrow->inventory_item_id);
        if ($item) {
            $item->quantity += $releaseQty;
            $item->save();
        }

        $itemName = $item->name ?? 'item';

        if ($releaseQty >= $borrow->quantity) {
            $borrow->delete();
        } else {
            $borrow->quantity -= $releaseQty;
            $borrow->save();
        }

        $release = EventInventoryRelease::create([
            'event_id' => $event->id,
            'inventory_item_id' => $borrow->inventory_item_id,
            'quantity' => $releaseQty,
            'released_by' => auth()->user()?->user_code,
        ]);

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

        $releases = $base->with(['event:id,name', 'inventoryItem:id,name'])
            ->latest()
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get()
            ->map(fn ($r) => [
                'id' => $r->id,
                'event_id' => $r->event_id,
                'event_name' => $r->event?->name ?? 'Deleted event',
                'item_name' => $r->inventoryItem->name ?? 'Unknown item',
                'quantity' => $r->quantity,
                'released_by' => $r->released_by,
                'released_at' => $r->created_at,
            ]);

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
        if ($item && $item->quantity < $requestedQty) {
            return response()->json([
                'message' => "Can't undo -- only {$item->quantity} of this item is left in Inventory now. Some of it may have already been lent out again since it was released.",
            ], 422);
        }

        $borrow = $event->borrowedItems()->where('inventory_item_id', $release->inventory_item_id)->first();
        if ($borrow) {
            $borrow->quantity += $requestedQty;
            $borrow->save();
        } else {
            $borrow = $event->borrowedItems()->create([
                'inventory_item_id' => $release->inventory_item_id,
                'quantity' => $requestedQty,
            ]);
        }

        if ($item) {
            $item->quantity -= $requestedQty;
            $item->save();
        }

        // Shrink this release record by however much of it was just
        // undone; once nothing is left of it, mark it fully undone so it
        // drops off the Recently Released list. A partial undo leaves the
        // record showing the remaining (still genuinely released) amount.
        $release->quantity -= $requestedQty;
        if ($release->quantity <= 0) {
            $release->quantity = 0;
            $release->undone_at = now();
        }
        $release->save();

        $itemName = $item->name ?? 'item';
        $this->createLog('Undo Return', 'Inventory', "Undid return of {$requestedQty}x {$itemName} for event: {$event->name}");

        return response()->json(['message' => 'Release undone -- the item is marked borrowed again.']);
    }
}
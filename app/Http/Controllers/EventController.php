<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use App\Models\EventAttendance;
use App\Models\EventInventoryItem;
use App\Models\InventoryItem;
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
        $request->validate([
            'name'                 => 'required|string|max:255',
            'description'          => 'required|string',
            'location'             => 'nullable|string|max:100',
            'event_start'          => 'required|date',
            'event_end'            => 'required|date|after:event_start',
            // Call time = when sign-in/out actually opens, separate from
            // the event's own start/end (e.g. call time 6:00, event starts
            // 7:00 -- sign-in is only open 6:00-7:00).
            'call_time_start'      => 'required|date|before_or_equal:event_start',
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
        $request->validate([
            'name'                 => 'required|string|max:255',
            'description'          => 'required|string',
            'location'             => 'nullable|string|max:100',
            'event_start'          => 'required|date',
            'event_end'            => 'required|date|after:event_start',
            'call_time_start'      => 'required|date|before_or_equal:event_start',
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
            $this->releaseBorrowedItems($event);
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
    $user = auth()->user();

    // ✅ Find only active (non-deleted) events
    $event = Event::withoutTrashed()->findOrFail($id);
    $eventName = $event->name;

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

        // Adviser recommendation: household-head SMS, sent once per household so
        // it complements (not duplicates) the in-app notifications below.
        // Fired on the initial announcement AND on a meaningful update -- see
        // update(), which only calls this with $isUpdate=true when the
        // schedule, venue, or message actually changed.
        $residents = User::where('role', 'Resident')
            ->whereIn('id', $userIds)
            ->with('household:id,contact_number')
            ->get(['id', 'contact_number', 'household_id', 'household_code', 'is_household_head', 'household_contact_number']);

        $smsPrefix = $isUpdate ? 'UPDATED: ' : '';
        $smsMessage = $smsPrefix . trim($event->name . ' — ' . ($event->notification_message ?? 'New event announced by Barangay Piao.'));
        app(SmsService::class)->notifyHouseholds($residents, $event->id, $smsMessage);

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
     * Returns every item currently borrowed by this event back to
     * Inventory and clears its borrow records. Called before re-applying
     * an edited borrow list, and when an event is archived.
     */
    private function releaseBorrowedItems(Event $event): void
    {
        foreach ($event->borrowedItems()->get() as $borrowed) {
            $item = InventoryItem::withTrashed()->find($borrowed->inventory_item_id);
            if ($item) {
                $item->quantity += $borrowed->quantity;
                $item->save();
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

        $this->createLog('Return Items', 'Inventory', "Returned {$releaseQty}x {$itemName} from event: {$event->name}");

        return response()->json(['message' => 'Item returned to Inventory.', 'released_quantity' => $releaseQty]);
    }
}
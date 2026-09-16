# PiaoConnect — additional flaws found (round 2)

Fresh audit pass over the controllers not covered in the first list (Archive, Event, Inventory, Membership, MembershipResident, EventExpense, Integration, Report, ActivityLog). Two real ones turned up — both concrete, reproducible bugs, not stylistic nits.

## 1. Cancelling an event doesn't re-flag its notification as unread

**File:** `app/Http/Controllers/EventController.php`, `destroy()`

When an event is archived, the code updates every resident's existing notification row to announce the cancellation:

```php
Notification::where('event_id', $id)->update([
    'type' => 'event_deleted',
    'title' => '❌ Event Cancelled: ' . $eventName,
    'message' => 'We apologize for the inconvenience. This event has been cancelled.',
    'is_updated' => true,
    'updated_at' => now(),
]);
```

Compare this to `sendEventNotifications()`'s update branch (used when an event is rescheduled or its message is edited), which does the same kind of update but also sets `'read' => false`.

**Failure scenario:** a resident already opened and read the original "New Event" notification. Staff then cancel the event. The notification's text and title change to the cancellation message, but `read` stays `true` — so the resident's unread badge never increments and the notification doesn't surface as new. The one update residents most need to actually see (their event got cancelled) is the one most likely to go unnoticed if they'd already read the original announcement.

**Fix:** add `'read' => false` to that update call, same as the reschedule/edit path.

## 2. Every archived event appears twice on the Archive page

**Files:** `app/Http/Controllers/ArchiveController.php` (`index()`), `resources/js/pages/staff/views/ArchiveView.tsx`

`ArchiveController::index()` builds the archive list from several sources merged together, including:

- `Event::onlyTrashed()` → one row per soft-deleted event, `type: 'event'`
- `Notification::where('type', 'event_deleted')->...->unique('event_id')` → one row per event that has a cancelled notification, `type: 'notification'`

But `EventController::destroy()` (see #1 above) retypes a deleted event's *existing* notifications to `'event_deleted'` rather than creating a new record — and `sendEventNotifications()` already creates a notification for every targeted resident whenever an event is created. So archiving any event with at least one notification (i.e. essentially every event) produces both a `type: 'event'` archive row and a `type: 'notification'` archive row for the exact same event.

The frontend (`ArchiveView.tsx`) treats `'event'` and `'notification'` as genuinely separate filterable types (`Events` vs. `Notify`, different icons/badge colors), and both are independently restorable — `restoreType = restoreItem.type === 'notification' ? 'event' : restoreItem.type` maps a `'notification'` row's restore action back onto the same event. So browsing the unfiltered Archive list, staff see every deleted event listed twice, under two different-looking badges, and could restore "the same thing" from either row without realizing they're the same underlying event.

**Fix options:**
- Simplest: drop the `$notifications` block from `ArchiveController::index()` entirely — the `$events` entries already cover every deleted event, so the `'notification'` type doesn't add real information once it's guaranteed to duplicate the event row.
- Alternative if the "Notify" filter is meant to stay: dedupe by excluding any `event_id` from `$notifications` that already has a corresponding row in `$events` (they always will, per the above), or repurpose the notification-type row for guaranteed-to-be-different metadata (e.g. distinct entries for actual notification content, decoupled from the event archive row).

---

One minor, low-priority note not included above: `MembershipResidentController::store()`/`update()` create `membership_residents` pivot rows in a loop with no duplicate check (unlike `UserController::update()`'s `$user->memberships()->sync($ids)`, which is the actual path the Residents form uses). I checked and the frontend never calls these write endpoints — only the read endpoints (`index`/`show`) are used, via `fetchResidents()` in ResidentsView and the membership-count lookup in Members.tsx — so this isn't reachable through the app today. Flagging only in case that endpoint gets wired up later.

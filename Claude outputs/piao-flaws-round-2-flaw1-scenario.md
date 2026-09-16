# Round-2, flaw 1 — walked through as an example scenario

## Scenario: Pedro misses his event's cancellation because he'd already read the announcement

**Setup:** Staff create a community clean-up event, "Barangay Piao Coastal Clean-Up," targeted at all residents. Pedro Reyes is one of the residents notified.

**Walkthrough:**

1. The moment the event is created, `sendEventNotifications()` creates a `Notification` row for every eligible resident, including Pedro — type `event_created` (or similar), `read = false`. Pedro's unread badge shows a `1`.
2. Later that day, Pedro opens the app, taps the notification, reads "Barangay Piao Coastal Clean-Up — this Saturday, 7 AM." His notification's `read` flips to `true`. His badge count drops back to `0`. He mentally files it as "already handled, I know about this event."
3. Two days later, heavy rain is forecast for Saturday. Staff decide to cancel the event. They go to the Events page and archive it. `EventController::destroy()` runs:
   ```php
   Notification::where('event_id', $id)->update([
       'type' => 'event_deleted',
       'title' => '❌ Event Cancelled: Barangay Piao Coastal Clean-Up',
       'message' => 'We apologize for the inconvenience. This event has been cancelled.',
       'is_updated' => true,
       'updated_at' => now(),
   ]);
   ```
   This retypes Pedro's *existing* notification row in place — same row from step 1, not a new one — swapping in the cancellation title and message. But it never touches `read`, which is still `true` from when Pedro opened it in step 2.
4. Pedro's phone shows no badge, no new-notification indicator, nothing. As far as the app visibly tells him, there's nothing new to check. He has no reason to reopen a notification he already read.
5. Saturday morning, Pedro shows up at the coastal clean-up site at 7 AM, in the rain, because he never found out it was cancelled. The one update he most needed to actually notice — "don't come, this is cancelled" — is exactly the one that looked like old news to the app.

**Why it's surprising to staff:** the *other* path that edits an existing notification in place — `sendEventNotifications()`'s update branch, used when an event is merely rescheduled or its message is edited — already does the right thing:
```php
Notification::where('event_id', $event->id)->update([
    ...
    'read' => false,   // <-- present here
]);
```
Cancelling an event goes through a different code path in `destroy()` that does the same kind of "retype the existing row" update, but the person who wrote it didn't carry over that one line. So a reschedule correctly re-surfaces as unread, but a cancellation — arguably the more urgent of the two — silently doesn't.

**Fix (already applied earlier this session):** `destroy()`'s notification update now includes `'read' => false`, matching the reschedule/edit path, so a cancellation always re-surfaces as unread regardless of whether the resident had already read the original announcement.

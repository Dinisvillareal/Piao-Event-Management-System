# PiaoConnect — additional flaws found (round 4)

Audit pass over `ReportController`, `Event`'s attendance-sync logic, `InventoryController`/`MembershipController`, and `FacebookService`. Two real ones turned up.

## 1. Filtering the Attendance report by age group understates the attendance percentage

**File:** `app/Http/Controllers/ReportController.php`, `attendanceSummary()`

The "eligible" count (the denominator) is computed from **every** attendance row for each event, regardless of the `age_group` filter:

```php
$totalEligible = 0;
foreach ($events as $event) {
    $totalEligible += $event->attendances()->count();   // <-- not age-filtered
}
```

But the "attended" count (the numerator) **is** filtered by age group, because it comes from `$attendances`, which was built off a query that adds the age filter when one is present:

```php
$attendanceQuery = EventAttendance::whereIn('event_id', $eventIds)->with('user');
if ($ageGroup && isset($ageRanges[$ageGroup])) {
    $attendanceQuery->whereHas('user', function ($q) use ($min, $max) { ... });
}
$attendances = $attendanceQuery->get();
...
$attendedCount = $attendances->filter(fn ($a) => $a->time_in)->count();
$percentage = $totalEligible > 0 ? round(($attendedCount / $totalEligible) * 100, 1) : 0;
```

The same mismatch repeats per-event a few lines down (`$eligible = $event->attendances()->count();` — not age-filtered — vs. `$attended` from the already age-filtered `$attendances`).

**Failure scenario:** Staff pull the Attendance report and filter by `age_group=senior` to see how well-attended events are among seniors specifically. Say an event has 100 total eligible residents, of which 15 are seniors, and all 15 seniors attended. The numerator (`attendedCount`) correctly comes out to 15, but the denominator (`totalEligible`) is still 100 — the whole event's attendee pool, not just seniors — so the report shows a 15% attendance rate for seniors, when the real number is 100%. Every age-filtered view of this report understates attendance, worse the smaller the selected age group is relative to the event's full audience.

**Fix:** compute `$totalEligible` (and each per-event `$eligible`) from the *same* age-filtered query used for `$attendances`, e.g. by counting `EventAttendance::where('event_id', $event->id)` through the same `whereHas('user', ...)` age constraint instead of the unfiltered `$event->attendances()->count()`.

## 2. Narrowing an event's target membership after sign-ins have started deletes real attendance records

**Files:** `app/Models/Event.php` (`syncAttendanceRecords()`), `app/Http/Controllers/EventController.php` (`update()`)

Editing an event recalculates who's "eligible" and reconciles attendance rows to match:

```php
public function syncAttendanceRecords()
{
    $eligibleResidentIds = $this->getEligibleResidents()->pluck('id')->toArray();
    $existingResidentIds = $this->attendances()->pluck('user_id')->toArray();

    $newResidentIds = array_diff($eligibleResidentIds, $existingResidentIds);
    foreach ($newResidentIds as $residentId) {
        EventAttendance::create([... 'status' => 'missed']);
    }

    $removedResidentIds = array_diff($existingResidentIds, $eligibleResidentIds);
    if (!empty($removedResidentIds)) {
        $this->attendances()->whereIn('user_id', $removedResidentIds)->delete();
    }
}
```

`EventController::update()` calls this whenever `membership_ids` changes:
```php
if ($membershipChanged) {
    $event->syncAttendanceRecords();
}
```

The delete doesn't distinguish a placeholder `'missed'` row (nobody showed up yet, nothing to lose) from a row that already has real `time_in`/`time_out` data — it deletes both the same way.

**Failure scenario:** An event has a `call_time_start` earlier than its `event_start` (a normal setup — e.g. call time 6:00, event starts 7:00), so residents can sign in via QR before the event officially "starts." A few residents sign in during that window. Staff then edit the event — say, to narrow it from "All Residents" to "Youth Members" — while it's still technically Upcoming (editing is only blocked once `isEventOngoing()` becomes true at `event_start`, so this window is legitimately editable). Any resident who already signed in but doesn't belong to "Youth Members" is in `$removedResidentIds`, and their `EventAttendance` row — including their real `time_in` timestamp — is deleted outright. There's no trace afterward that they ever attended: it won't show in `getMemberHistory()`, the Attendance report, or make them eligible for post-event feedback, even though they were physically there and scanned in.

**Fix:** exclude residents who already have `time_in` (or `time_out`) recorded from the delete — e.g. `$this->attendances()->whereIn('user_id', $removedResidentIds)->whereNull('time_in')->delete()` — so narrowing the target audience only prunes untouched placeholder rows, never a resident's actual attendance.

---

Also checked this pass and found nothing wrong: `InventoryController`/`InventoryItem` borrow-tracking (stock deduction, return-on-archive, delete guards while on loan), `MembershipController` (archive is correctly blocked while residents are still assigned), and `FacebookService` (Graph API posting, connect/disconnect).

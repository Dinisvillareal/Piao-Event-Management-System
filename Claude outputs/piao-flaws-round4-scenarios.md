# Still-Open Flaws (from Round 4) — Example Scenarios

These two were reported earlier and never got fixed. Re-checked against the
current code (`app/Http/Controllers/ReportController.php` and
`app/Models/Event.php`) — both are still exactly as described.

## Flaw A: Editing an event's target membership permanently deletes real attendance history

**Where.** `Event::syncAttendanceRecords()`, called from
`EventController::update()` whenever staff change which membership(s) an
event is targeted at:

```php
$removedResidentIds = array_diff($existingResidentIds, $eligibleResidentIds);
if (!empty($removedResidentIds)) {
    $this->attendances()->whereIn('user_id', $removedResidentIds)->delete();
}
```

`EventAttendance` (`app/Models/EventAttendance.php`) has **no** `SoftDeletes`
trait, so this `->delete()` is a permanent, unrecoverable row deletion — not
an archive.

**Scenario.** "Bloodletting Drive" is created targeting the **Senior
Citizens** membership. On the day, 40 seniors show up, scan in and out —
`attendances` rows with real `time_in`/`time_out` for all 40. A week later,
staff realize the drive should have also counted **PWD** members and edits
the event to target **Senior Citizens + PWD** instead of just Senior
Citizens (maybe they typo'd and meant to *replace* it with PWD, or the
barangay captain asked to narrow it to PWD only going forward). The moment
that save happens, `syncAttendanceRecords()` recomputes "who's eligible
now," and every resident who isn't in the new membership list gets their
attendance row `DELETE`d outright — including the 40 seniors who physically
attended and already have recorded time-in/time-out. Their attendance for
that event is just gone: no soft-delete trail, nothing in Archive, nothing
a report can recover. If the field they edited was something as small as
fixing a typo in the event description that happened to also touch
membership_ids, staff wouldn't even realize real check-in data was wiped.

**The fix in spirit:** the eligibility list should only decide who gets a
*blank/placeholder* row added ahead of time — it should never delete a row
that already has `time_in` or `time_out` recorded. At most, a
no-longer-eligible resident's blank placeholder row (never attended) should
be removed; anyone who actually attended should be left alone regardless of
what the event's targeting changes to afterward.

---

## Flaw B: Age-group filter on the Attendance Summary report skews the percentage instead of narrowing it

**Where.** `ReportController::attendanceSummary()`:

```php
$attendanceQuery = EventAttendance::whereIn('event_id', $eventIds)->with('user');
if ($ageGroup && isset($ageRanges[$ageGroup])) {
    // filters the ATTENDED side only
    $attendanceQuery->whereHas('user', ...);
}
$attendances = $attendanceQuery->get();

$totalEligible = 0;
foreach ($events as $event) {
    $totalEligible += $event->attendances()->count(); // <- NOT filtered by age
}
$attendedCount = $attendances->filter(fn ($a) => $a->time_in)->count(); // <- IS filtered by age
$percentage = round(($attendedCount / $totalEligible) * 100, 1);
```

The same mismatch repeats per-event a few lines down (`$eligible` from the
unfiltered count, `$attended` from the filtered collection).

**Scenario.** "Feeding Program" has 100 eligible residents total, of whom 20
are in the **Senior** age bracket. All 20 seniors attended (100% turnout for
that group); only 10 of the other 80 attended. Staff open Reports →
Attendance Summary and filter by **Age Group: Senior**, expecting to see
"20 / 20 attended = 100%" for seniors specifically. Instead the report shows
`$attendedCount = 20` (correctly the seniors who attended) divided by
`$totalEligible = 100` (everyone eligible for the event, not just seniors),
so it reports **20%** — which isn't senior turnout, isn't overall turnout,
isn't anything real. It looks like a *bad* turnout number for a group that
actually had perfect attendance, right when staff are specifically trying
to check on that one group (e.g. to justify a senior-focused program to the
barangay council).

**The fix in spirit:** `$totalEligible` needs the same age-group `whereHas`
filter applied to the eligibility count as is already applied to the
attended count — both sides of the ratio have to be scoped to the same
population.

---

Want me to implement either or both of these?

# Round 5 Flaws — Example Scenarios

## Flaw 1: Attendance scan endpoints have no authorization check

**Setup.** Barangay Piao is holding "Zumba Night" (`event_id = 41`), scheduled 6:00–8:00 PM with call time starting at 5:30 PM. Two residents have accounts: Maria (`user_id = 12`), who is actually at the venue, and Jomar (`user_id = 19`), who is at home and has no intention of going.

**What's supposed to happen.** A staff member stands at the door with the Scan page, scans Maria's QR code, and the app calls `POST /attendance/time-in` with `{ event_id: 41, user_id: 12 }`. Only Staff accounts can reach that page, so only staff can create attendance rows.

**What actually happens.** Jomar is logged into the Member portal on his phone — a completely ordinary Resident session, not Staff. At 5:45 PM (inside the call-time window), he opens his browser's dev tools (or just runs a one-line `fetch` from the console) and sends:

```js
fetch('/attendance/time-in', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': /* his own cookie */ '...' },
  body: JSON.stringify({ event_id: 41, user_id: 12 })
})
```

`EventAttendanceController::timeIn()` validates that `event_id` and `user_id` exist, checks the time window, and creates the `EventAttendance` row — it never checks that the *caller* (Jomar, `auth()->id() === 19`) has anything to do with `user_id = 12`, and never checks `isStaff()`. The request succeeds. Maria — who is still at home, hasn't scanned anything, and doesn't even know this happened — now shows as "signed in" to Zumba Night in the Reports and in her own attendance history.

Jomar could just as easily send `{ event_id: 41, user_id: 19 }` for *himself* and get credited with attendance (needed for a membership renewal, a raffle entry, whatever the barangay ties attendance to) without ever leaving his house. Either direction — faking someone else's attendance or his own — works with nothing more than a browser console and his own normal login.

**Why it matters.** Attendance records feed the reports staff use for turnout and, per the entity notes, are the kind of record a membership or benefit eligibility might reasonably be checked against — so this isn't just a cosmetic count being wrong, it's residents being able to fabricate the one record that's supposed to prove physical presence.

---

## Flaw 2: Restoring an archived resident leaves stale `deleted_by`

**Setup.** Staff member **Rosa** (`user_code = ST-0002`) archives resident **Ben** on August 1st for having moved away. `UserController::destroy()` sets `deleted_by = 'ST-0002'` and soft-deletes him. Archive view correctly shows "Ben — deleted by ST-0002."

**What's supposed to happen.** Two weeks later, Ben moves back. Staff member **Carlo** opens the Archive page and clicks **Restore** on Ben's row. Since Ben is active again, the "deleted by" attribution is stale information that belongs to a deletion event that no longer applies — the other six archived types (households, events, inventory items, age brackets, civil statuses, current statuses) all null it out on restore for exactly this reason.

**What actually happens.** `ArchiveController::restore()`'s `case 'resident':` branch only calls `$item->restore()` — it skips the `$item->deleted_by = null` line every other case has. Ben's row in the `users` table now reads: `deleted_at = null` (active), but `deleted_by = 'ST-0002'` (still there from the August 1st archive). Nothing currently displays that field for an *active* resident, so today it's silently wrong rather than visibly wrong — but it's wrong in the same row the rest of the system treats as the source of truth for "who archived this person," and it will stay wrong indefinitely unless Ben happens to get archived again by someone else, which overwrites it.

**Where this bites in practice.** If a "Deleted / Restored by" audit trail or export is ever added to the Resident profile (a very natural next feature, since the Archive list already shows it for the archived state), it would report "Deleted by ST-0002" against a resident who is currently active and was in fact last touched by Carlo, not Rosa — misattributing an action to the wrong staff member.

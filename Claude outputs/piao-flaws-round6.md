# Round 6 Flaw — Example Scenario

## Activity Logs endpoints have no Staff check — any resident can read the entire system audit trail

**Where.** `app/Http/Controllers/ActivityLogController.php` — `index()`,
`today()`, and `show($id)` never call `isStaff()` (or any authorization
check at all). The routes are only inside the blanket `auth` group in
`routes/web.php`:

```php
Route::get('/activity-logs', [ActivityLogController::class, 'index']);
Route::get('/activity-logs/today', [ActivityLogController::class, 'today']);
Route::get('/activity-logs/{id}', [ActivityLogController::class, 'show']);
```

Every other place that shows this kind of internal/operational data —
Archive, Reports, Budget, SMS Logs, `getAllForMemberships`, `ineligibleMembers`,
etc. — checks `isStaff()` first. This is the one log/audit endpoint that
doesn't.

**Scenario.** Resident **Jomar** (same ordinary Member-portal account as
before) is logged in. He opens his browser console and runs:

```js
fetch('/activity-logs?per_page=100', { headers: { Accept: 'application/json' } })
  .then(r => r.json()).then(console.log)
```

The response comes back with a full page of the system's activity log —
things like:

- `"Staff: Rosa logged in"` / `"Staff: Carlo logged out"` with timestamps —
  Jomar now knows exactly when each staff account is (and isn't) active.
- `"Archived resident 'Ben Santos'"`, `"Restored resident 'Ben Santos'"` —
  who got archived/restored and by which staff `user_code`.
- `"Recorded expense 'Sound system rental' (PHP 8,000) for event: Fiesta
  Prep"` — budget entries, amounts, and who recorded them.
- `"Updated inventory item: Plastic Chairs"`, `"Archived inventory item:
  Projector (condition: Lost)"` — inventory changes.
- Anything else any staff member has ever done in the system, paginated 20
  at a time, searchable by `?search=` and filterable by `?type=` and
  `?date=` — he can just page through the whole history, or search for a
  specific staff `user_code` or a specific resident's name to see every
  action ever taken involving them.

None of this requires a Staff account or even the Staff-side UI — it's a
plain authenticated `fetch()` from the Member portal session Jomar already
has. The frontend's Activity Logs page (Staff-only in the UI) is just one
way to read this data; the API itself doesn't care who's asking.

**Why it matters.** This isn't attendance data or one resident's own
record — it's the operational audit trail of the whole barangay office:
staff login patterns, every archive/restore/delete across every module,
and every budget figure recorded against an event. That's exactly the kind
of internal information a resident account should never be able to pull.

**The fix in spirit:** add the same `if (!$this->isStaff()) { return ...
403; }` guard already used everywhere else in the app to `index()`,
`today()`, and `show()` in `ActivityLogController`.

---

Want this one fixed too?

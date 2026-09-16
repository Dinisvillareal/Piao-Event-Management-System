# PiaoConnect — additional flaws found (round 3)

Audit pass over the household/user-linking logic (`HouseholdController`, `UserController`, plus `NotificationController` and `EventAttendanceController` for good measure). Two real ones turned up, both around the same area: who gets to become "head of household."

## 1. Creating a household with existing members can silently hand it a head nobody chose

**File:** `app/Http/Controllers/HouseholdController.php`, `store()`

```php
$memberIds = $request->member_ids ?? [];
if (!empty($memberIds)) {
    User::whereIn('id', $memberIds)->update([
        'household_id' => $household->id,
    ]);
}
```

This is a raw mass update — it only touches `household_id`. It does **not** touch `is_household_head`.

Compare that to every other place in the app that moves a resident into a household, which all explicitly clear the flag first:

- `HouseholdController::addMember()` (a few methods down) sets `'is_household_head' => false` on the exact same kind of assignment, with a comment explaining exactly why: *"A resident being linked in from outside this household never carries an is_household_head flag with them... Left alone, a stale true here plus this household's own existing head is exactly how a household ends up with two heads."*
- `UserController::update()` does the same when `household_id` changes: *"Unlinking, or moving to a different household, clears any stale head flag... silently carrying it over to a new household could double it up with whoever is already the head there."*

`store()`'s bulk `member_ids` path is the one place that skips this.

**Failure scenario:** Resident A is (or ever was) `is_household_head = true` for Household X. Staff later create a brand-new Household Y and add A as a member via the "create household" form's member picker, without touching the head field at all. A's `household_id` flips to Y, but `is_household_head` stays `true` from before — so Household Y now shows A as its head, a decision staff never actually made. If Y already has a different head selected via `head_user_id` in the same request, you get a brief double-head state until the explicit `head_user_id` block runs afterward (and if `head_user_id` isn't set at all, the stale flag just sticks).

**Fix:** clear the flag in the same update, same as `addMember()` does:
```php
User::whereIn('id', $memberIds)->update([
    'household_id' => $household->id,
    'is_household_head' => false,
]);
```

## 2. A resident can make themselves household head (or move households) through their own profile edit

**Files:** `app/Http/Controllers/UserController.php` (`update()`), `routes/web.php`

`PUT /users/{id}` is reachable by any authenticated user editing their own record — `update()`'s only gate is `isOwnProfile($id) || isStaff()`. Inside that method, several sensitive fields are explicitly restricted to staff:

```php
if ($this->isStaff() && $request->filled('role')) { ... }
...
if ($request->has('has_account')) { ... }   // only reachable meaningfully via staff UI, but see below
...
if ($this->isStaff() && $request->has('membership_ids')) { ... }
```

But the household-linking block right above them has no such guard:

```php
if ($request->has('household_id')) {
    $originalHouseholdId = $user->household_id;
    $user->household_id = $request->filled('household_id') ? (int) $request->household_id : null;
    if ($user->household_id !== $originalHouseholdId) {
        $user->is_household_head = false;
    }
}

if ($request->has('is_household_head')) {
    $wantsHead = filter_var($request->is_household_head, FILTER_VALIDATE_BOOLEAN);
    if ($wantsHead && !$user->household_id) { ... 422 ... }
    if ($wantsHead) {
        User::where('household_id', $user->household_id)->where('id', '!=', $user->id)
            ->update(['is_household_head' => false]);
    }
    $user->is_household_head = $wantsHead;
}
```

Both `household_id` and `is_household_head` are accepted and validated by `UpdateUserRequest` (`'household_id' => 'nullable|integer|exists:households,id'`, `'is_household_head' => 'nullable|boolean'`), and neither block checks `$this->isStaff()`.

**Failure scenario:** A logged-in Resident sends `PUT /api/users/{their own id}` with `household_id: <any household's id>, is_household_head: true`. Nothing in `update()` stops it — they link themselves into any household in the system and simultaneously demote whoever was actually the head there (the "clear any stale flag first" query runs unconditionally, not just for staff). The normal Residents-management UI never exposes this to a resident, but the API endpoint itself doesn't enforce it, so it only takes a direct request, not a UI bug.

**Fix:** wrap both blocks the same way the `role`/`membership_ids` blocks already are:
```php
if ($this->isStaff() && $request->has('household_id')) { ... }
if ($this->isStaff() && $request->has('is_household_head')) { ... }
```
(or, if residents are meant to self-report which household they belong to eventually, at minimum keep `is_household_head` staff-only — that's the part that actually grants a privilege.)

---

Also checked this pass and found nothing wrong: `NotificationController` (unread-count/mark-as-read scoping, staff grouped view), `EventAttendanceController` (sign-in/sign-out time windows, member history), `Notification`/`Event`/`Household` models, and `MembershipResidentController` (its `store`/`update`/`destroy` are still the same unreachable dead endpoints flagged in round 2 — untouched, still not called by the frontend).

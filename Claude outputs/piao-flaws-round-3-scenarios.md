# Round-3 flaws — walked through as example scenarios

## Scenario 1: A new household inherits a head nobody picked

**Setup:** The Santos family used to live together under Household `HH-0012`, with Juan Santos flagged as its head (`is_household_head = true`). Juan's parents later move out to live with their daughter, so staff decide to split the household.

**Walkthrough:**

1. Staff open the Households page and click "Create Household" for the new address.
2. They fill in the address/contact number, and in the member picker they check Juan's parents (not Juan) as the members to move in — Juan stays behind in `HH-0012` under a different head.
3. They submit the form. `HouseholdController::store()` runs:
   ```php
   User::whereIn('id', $memberIds)->update(['household_id' => $household->id]);
   ```
   This sets the parents' `household_id` to the new household, `HH-0013`. It does not touch `is_household_head` for anyone.
4. Staff don't pick a `head_user_id` for `HH-0013` in this request — they plan to set the head later with the star button.
5. Here's the catch: suppose Juan's mother had, months ago, briefly been marked head of a *different* household before that arrangement changed, and that stale `is_household_head = true` on her record was never cleared (because it's possible to move a resident between households in other ways, or the flag simply predates today's cleaner code paths). She's now added to `HH-0013` with `household_id` changed, but her old `is_household_head = true` never got reset by `store()`.
6. The moment she's saved into `HH-0013`, she is that household's head — visible on the Household page, and she's the one who'd receive the event SMS blast for `HH-0013` — even though no staff member ever clicked anything to make her the head. Nobody chose this; it fell out of a flag that should have been cleared and wasn't.

**Why it's surprising to staff:** every other "move a resident into a household" action in the app (the `addMember()` endpoint, and editing a resident's household from their profile) explicitly resets `is_household_head` to `false` first, specifically to prevent this. `store()`'s bulk member-picker is the one path that forgot to.

**Fix:** clear `is_household_head` in the same update `store()` already does for `household_id`.

---

## Scenario 2: A resident quietly makes themselves head of any household

**Setup:** Maria dela Cruz is a Resident (not Staff) with an account. She lives in `HH-0004`, where her older brother is the registered head. She's curious what she can do with her account and opens her browser's dev tools while logged in to PiaoConnect.

**Walkthrough:**

1. Maria is on her own profile page. The Resident-facing UI only lets her edit her contact number — there's no household picker or "make me head" button anywhere in her view.
2. But she notices the app calls `PUT /api/users/{id}` for profile edits, and her own id is `id = 57`. She crafts her own request (or use the browser console) to:
   ```
   PUT /api/users/57
   { "household_id": 9, "is_household_head": true }
   ```
   targeting `HH-0009` — a household she isn't even a member of, maybe belonging to a family she's friendly with, or even a household with no relation to her at all.
3. The backend's only check on this route is `isOwnProfile(57) || isStaff()` — and it's her own id, so it passes.
4. Inside `update()`, the `household_id` block runs unconditionally (no `isStaff()` check) and links her to `HH-0009`. The `is_household_head` block also runs unconditionally: it clears the flag for anyone else in `HH-0009` (`User::where('household_id', 9)->where('id','!=',57)->update(['is_household_head' => false])`) — silently demoting the real head of that household — then sets Maria's own flag to `true`.
5. From that point on, `HH-0009`'s event SMS blasts go to Maria's phone number instead of the actual head's, and the Households page shows Maria as the head of a household she may have no real connection to.

**Why it's surprising to staff:** the fields are staff-only *in intent* — `role`, `has_account`, and `membership_ids` right in the same method are all wrapped in `if ($this->isStaff() && ...)` specifically to keep residents from touching them. `household_id` and `is_household_head` were simply left out of that pattern, even though they're at least as sensitive (they determine who gets treated as a household's authoritative contact).

**Fix:** wrap both blocks the same way — `if ($this->isStaff() && $request->has('household_id'))` and `if ($this->isStaff() && $request->has('is_household_head'))` — so only staff can move a resident between households or assign the head flag.

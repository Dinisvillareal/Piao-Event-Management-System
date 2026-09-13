# PiaoConnect — Functionality Flaws Found (Sep 13 audit)

Full pass over every backend controller (`app/Http/Controllers/*.php`), the `User`/`Household` models, and the Facebook/SMS integration services, cross-checked against the frontend where relevant. Ordered roughly by how much it can actually hurt you in production.

## Already fixed this session (recap, not new)

- Household was the only soft-deletable entity missing from the real Archive/restore system (`ArchiveController`) — added.
- Ongoing/Past events could still be edited or deleted by hitting the API directly (UI-only lock before) — added a server-side guard in `EventController`.
- Event Start Time / Call Time could be set in the past, and Call Time could equal Start Time — added validation on both frontend and backend.

## High priority

**1. Archiving a household never records who did it.**
`HouseholdController::destroy()` soft-deletes the household but never sets `deleted_by`, even though the `deleted_by` column exists (migration `2026_09_09_000001_add_deleted_by_to_households_table.php`) and every other archivable entity (events, inventory, age brackets, civil statuses, current statuses, memberships, residents) sets it before deleting. Result: the Archive page will always show "SYSTEM" as who archived a household instead of the real staff member. Cheap, mechanical fix — one line, matching the pattern already used everywhere else.

**2. Dead `household_code` / `household_contact_number` fields are still live in the API.**
The migration that introduced the real `household_id` relationship says outright: *"the old `household_code` (free text), `household_contact_number`... are kept as-is — nothing reads/writes them going forward, new code should use `household_id` + the `households` table instead."* But:
- `UserController::index()` still accepts and applies a `?household_code=` filter.
- `UserController::getAllForMemberships()` still returns both fields in its response, alongside the real `household` object.
- `NotificationController::smsLogs()` eager-loads `household_code` on the user instead of the real household relation.

Since nothing updates these columns anymore, they're frozen at whatever they were before the Household module existed. Any resident whose real household has changed since then will show a stale/wrong value wherever these fields are still read. Needs a check of what the frontend actually does with them before deciding whether to strip them from these three spots or backfill them — don't want to break a screen that's quietly still displaying them for old records.

**3. No "still in use" guard when deleting an Age Bracket / Civil Status / Current Status.**
`MembershipController::destroy()` correctly blocks archiving a membership if residents are still assigned to it. `InventoryController` blocks deleting an item currently borrowed. But `AgeBracketController`, `CivilStatusController`, and `CurrentStatusController` have no equivalent check — you can delete a lookup value that a Membership's eligibility rule (`eligible_age_bracket_id` / `eligible_civil_status_id` / `eligible_current_status_id`) still points to. Because these are soft-deletes, the membership silently keeps pointing at a trashed row — its eligibility label goes blank and the eligibility check will simply never match anyone again, with no warning to staff that this happened.

**4. Login has no rate limiting.**
`UserController::login()` checks the password with no throttling or lockout on repeated failures. Anyone can script unlimited password guesses against any `user_code`. Laravel's built-in throttle middleware (or a manual attempt counter) is the standard fix here.

**5. Feedback can be submitted before the event is actually over.**
`FeedbackController::store()` only requires `time_in` to be set (i.e., the resident signed in) — not that the event has ended or they signed out. Meanwhile `FeedbackController::pending()` (which drives the "please rate this" prompt) only surfaces events with status `Complete`. So the prompt itself waits for the event to finish, but a resident who knows the endpoint could rate an event that's still hours away from ending.

**6. Facebook Page access token stored in plaintext.**
`FacebookService::connect()` writes the long-lived Page access token straight into the `integration_settings` JSON column with no encryption. Anyone with database access (or a leak/backup) gets full posting control of the barangay's Facebook Page. Laravel has built-in encrypted attribute casting that would fix this with minimal code change.

## Worth noting

**7. Duplicate-name check has a race condition.**
`UserController::store()`/`update()` check for an existing resident with the same name, then create/save afterward — with no database-level unique constraint backing it (unlike the household-head flag, which does have a real unique index and a dedicated conflict handler). Two near-simultaneous submissions with the same name could both pass the check and both get created.

**8. Deleting a household head doesn't clear the flag.**
If staff soft-delete a resident who currently has `is_household_head = true`, nothing clears that flag or reassigns headship. If that resident is restored later, they could silently reappear as head — possibly conflicting with whoever became head of that household in the meantime.

**9. Timezone inconsistency in date filtering.**
`ActivityLogController`'s date filter explicitly parses dates in `Asia/Manila`. `NotificationController::staffNotifications()`'s upcoming/past filter just uses `now()` (server default timezone). If the server isn't actually set to Asia/Manila, events near midnight could be classified as upcoming/past a few hours off from what staff expect in local time. Worth confirming `config/app.php`'s timezone setting matches what the rest of the app assumes.

---

Tell me which of these you want tackled first — #1 and #4 are quick, contained fixes; #2 needs a look at the frontend before touching anything; #3, #7, #8 follow the same "add a guard" pattern already used elsewhere in the app.

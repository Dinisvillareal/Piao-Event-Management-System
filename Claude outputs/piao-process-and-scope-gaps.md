# PiaoConnect — Process & Scope Gaps (beyond the flaw rounds)

Rounds 2–6 (and the Sep 13 audit) already cover concrete backend bugs. This
pass looks at what's *missing* rather than what's *broken* — things a
capstone panel is likely to ask about, and production-readiness items that
don't show up as a bug because the feature simply isn't there yet.

## A. Account & access gaps

**No self-service password reset.** There's no "Forgot password" route
anywhere in `routes/web.php` — a resident who forgets their password has no
way to recover the account except asking staff to manually reset it via
`UserController::changePassword`. For a public-facing resident portal this
is a real support burden and a common panel question ("what happens when a
user forgets their password?").

**No account/email verification.** Accounts are created directly by staff
with `has_account`/password set on the spot — reasonable for a barangay
context, but worth stating explicitly as a design decision in your
documentation rather than leaving it as something that looks unfinished.

**No 2FA/MFA, and only the login route is rate-limited.** `throttle:6,1` on
`/login` is a good start, but `change-password`, `feedback`, and other
write endpoints have no throttling at all — someone scripting requests
against those isn't slowed down the way login attempts are.

## B. Data privacy (Republic Act 10173)

This system stores real resident PII — full names, contact numbers,
gender, civil status, household composition, attendance history. Worth
checking, and documenting either way for your manuscript:

- Is there any consent capture when a resident's data is first encoded
  (a signed/digital acknowledgment that the barangay is collecting and
  processing their data)?
- Is there a stated data retention/disposal policy (how long is a
  resident's record kept after they move away or a household dissolves)?
- The Facebook Page access token is stored in plaintext in
  `integration_settings` (flagged in the Sep 13 audit) — same category of
  issue: sensitive credentials/PII at rest with no encryption.
- No visible right-to-access/right-to-correction workflow for residents
  to request a copy or correction of their own data, which RA 10173
  technically obligates a personal-information controller to provide.

Even if you don't implement all of this, a capstone panel evaluating a
system that handles real barangay resident data will very likely ask about
Data Privacy Act compliance — having a documented answer matters even where
the feature itself is out of scope.

## C. Production readiness

- **`DB_CONNECTION=sqlite`** in `.env.example` — fine for development, but
  SQLite serializes writes at the file level, so it doesn't handle
  concurrent staff sessions writing at the same time as well as MySQL/
  Postgres would. Worth stating explicitly whether the deployed version
  will run on SQLite or a real RDBMS, since that's a defense-relevant
  architecture decision, not just a config detail.
- **`APP_DEBUG=true`** and **`LOG_LEVEL=debug`** are the shipped defaults.
  There's nothing in the repo enforcing these get flipped for a real
  deployment — leaving debug mode on in production would expose stack
  traces (file paths, query text, sometimes `.env` values) to anyone who
  hits an error page.
- **`SESSION_SECURE_COOKIE`** is unset (`null`), meaning the session
  cookie isn't marked `Secure` unless someone sets that env var — needed
  once the site is served over HTTPS, otherwise the cookie can leak over
  a plain HTTP connection.
- **SMS and Facebook integrations are both "simulated" until configured**
  (`SMS_PROVIDER` empty → logged only, not actually sent). That's a
  reasonable dev default, but it means the notification features you
  likely demo/describe in your manuscript may not actually be live unless
  someone deliberately wires up a real SMS provider and Facebook Page
  token before deployment — worth a checklist item so it isn't discovered
  missing at the actual barangay office.
- No visible backup/restore process for the database or uploaded files
  (expense receipts, etc.) — worth at least documenting a manual backup
  step (e.g., a cron'd `sqlite3 .backup` or a scheduled DB dump) even if
  it's simple, since "what happens if the server disk fails" is a fair
  question for a system that's meant to hold a barangay's actual records.

## D. Test coverage

Only one feature has automated tests — `InventoryBorrowGuardTest.php` (4
tests, covering the borrow-guard delete rule). Everything else — login,
household/membership logic, event creation and attendance, budget/expense
tracking, feedback, archive/restore, reports — has zero automated test
coverage. `tests/Feature/ExampleTest.php` and `tests/Unit/ExampleTest.php`
are still the default Laravel scaffolding, never replaced.

This matters for a capstone specifically because rounds 2–6 of the flaw
audit found real, subtle logic bugs (stale household-head flags, attendance
records silently deleted, report percentages computed wrong) that a small
feature-test suite around each controller's key rules would have caught
automatically and kept caught. Worth flagging in your documentation as a
known limitation / future-work item if there isn't time to build it out
before defense.

## E. Missing modules that are common in barangay management systems

Not necessarily required for your scope, but worth deciding on
deliberately (in scope vs. explicitly out of scope in your documentation)
since a panel familiar with other barangay-system capstones may expect
them:

- **Certificate/clearance issuance** (barangay clearance, certificate of
  residency/indigency) — this system tracks residents and households but
  doesn't appear to generate any official request-and-release documents.
- **Blotter / incident or complaint reporting** — no module for logging
  resident complaints or incident reports.
- **A general announcements/bulletin feed** separate from event
  notifications, for non-event barangay announcements.

## F. Documentation gaps in the repo itself

`README.md` is still the stock Laravel template — it says nothing about
what PiaoConnect actually is, how to set it up, seed data, or run tests.
The real project documentation (system update summaries, PDF/Word export
previews, flaw-fix guides) all lives as separate files in `Claude
outputs/`, outside of what a new developer (or a panel member skimming the
repo) would see first. Worth at minimum replacing the README with a short
project-specific one: what the system does, setup steps, default seeded
accounts, and a pointer to where the fuller documentation lives.

---

None of the above are code changes — they're either process/documentation
items for your manuscript, or deployment-checklist items to decide on and
write down before the system goes live at the actual barangay office.

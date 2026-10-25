<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\BarangayOfficials;
use App\Models\Household;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\AgeBracket;
use App\Models\Membership;
use App\Services\SecurityService;
use App\Support\Totp;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class UserController extends Controller
{
    // =========================
    // HELPERS
    // =========================

    private function isOwnProfile($id)
    {
        return auth()->id() == $id;
    }

    /** Internal error text is logged, never sent to the browser in production. */
    private function safeError(\Throwable $e): string
    {
        Log::error($e->getMessage(), ['exception' => $e]);
        return config('app.debug') ? $e->getMessage() : 'Something went wrong. Please try again.';
    }

    private static ?string $dummyHash = null;

    /**
     * True when $e is the DB rejecting a second is_household_head = true
     * row for the same household (see the users_one_head_per_household
     * unique index) -- the rare case of two truly concurrent requests
     * both passing the PHP-level "no head yet" check before either
     * commits. Lets callers turn that into a friendly message instead of
     * a raw SQL error.
     */
    private function isHeadConflict(\Throwable $e): bool
    {
        return $e instanceof \Illuminate\Database\QueryException
            && str_contains($e->getMessage(), 'users_one_head_per_household');
    }

    /**
     * True when $e is the DB rejecting a duplicate active (non-deleted)
     * full name via the users_unique_active_full_name unique index --
     * the race-condition case where two requests both pass the PHP-level
     * "does this name already exist" check above before either commits.
     * Lets callers turn that into the same friendly validation message
     * the PHP-level check already returns, instead of a raw SQL error.
     */
    private function isDuplicateNameConflict(\Throwable $e): bool
    {
        return $e instanceof \Illuminate\Database\QueryException
            && str_contains($e->getMessage(), 'users_unique_active_full_name');
    }

    /**
     * Applies the requested Barangay Captain / Secretary post to $user (does not
     * save -- the caller saves/creates). Returns the CURRENT holder when the post
     * is already taken and the request did not confirm replacing them, else null.
     */
    private function applyBarangayPosition(User $user, Request $request): ?User
    {
        $position = $request->filled('barangay_position') ? $request->barangay_position : null;
        // Strictly one holder per post: a post that is already held can never be
        // taken over from here. The current holder has to be set to "None" first.
        $replace = false;

        $previousHolderCode = null;
        if ($position) {
            $previous = BarangayOfficials::holder($position);
            $previousHolderCode = $previous && $previous->id !== $user->id ? $previous->user_code : null;
        }

        $taken = BarangayOfficials::assign($user, $position, $replace);
        if ($taken) {
            return $taken;
        }

        $user->save();

        $title = $position ? (BarangayOfficials::TITLES[$position] ?? $position) : null;
        if ($position) {
            $this->createLog(
                'Barangay Position',
                'User',
                "{$user->user_code} is now the {$title}" . ($previousHolderCode ? " (replaced {$previousHolderCode})" : '')
            );
        } else {
            $this->createLog('Barangay Position', 'User', "{$user->user_code} no longer holds a barangay post");
        }

        return null;
    }

    private function positionTakenResponse(string $position, User $holder)
    {
        $title = BarangayOfficials::TITLES[$position] ?? $position;
        return response()->json([
            'message' => "{$holder->first_name} {$holder->last_name} is already the {$title}.",
            'errors' => [
                'barangay_position' => [
                    BarangayOfficials::nameFor($holder, $position) . " is currently the {$title}. There can only be one -- set their position to None first before assigning it to someone else.",
                ],
            ],
            'position_taken' => [
                'position' => $position,
                'holder' => BarangayOfficials::nameFor($holder, $position),
            ],
        ], 422);
    }

    private function localUpload($file): string
    {
        $original = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $ext      = $file->getClientOriginalExtension();
        $clean    = preg_replace('/[^A-Za-z0-9\-_.]/', '_', $original);
        $filename = time() . '_' . $clean . '.' . $ext;

        $path = $file->storeAs('validation_ids', $filename, 'public');

        if (!$path) {
            throw new \Exception('File upload failed');
        }

        return $path;
    }

    private function localDelete(string $path): void
    {
        try {
            Storage::disk('public')->delete($path);
        } catch (\Exception $e) {
            \Log::warning($e->getMessage());
        }
    }

    /**
     * Adviser example (Senior Citizen eligibility) -- extended to Youth and
     * Solo Parent memberships. Blocks assigning a membership to a resident
     * whose age bracket / civil status doesn't match what the membership
     * requires (configured under Settings -> Profiling).
     */
    private function checkMembershipEligibility(array $membershipIds, ?string $birthDate, ?int $civilStatusId, ?string $gender = null, array $currentStatusIds = []): ?array
    {
        if (empty($membershipIds)) {
            return null;
        }

        $memberships = Membership::withoutTrashed()
            ->whereIn('id', $membershipIds)
            ->where(function ($q) {
                $q->whereNotNull('eligible_age_bracket_id')
                  ->orWhereNotNull('eligible_civil_status_id')
                  ->orWhereNotNull('eligible_current_status_id')
                  ->orWhereNotNull('eligible_gender');
            })
            ->with(['eligibleAgeBracket', 'eligibleCivilStatus', 'eligibleCurrentStatus'])
            ->get();

        if ($memberships->isEmpty()) {
            return null;
        }

        $age = null;
        if ($birthDate) {
            try {
                $age = \Carbon\Carbon::parse($birthDate)->age;
            } catch (\Exception $e) {
                $age = null;
            }
        }

        $residentBracket = AgeBracket::resolveForAge($age);

        $violations = [];

        foreach ($memberships as $membership) {
            if ($membership->eligible_age_bracket_id) {
                $requiredBracket = $membership->eligibleAgeBracket;
                if (!$residentBracket || $residentBracket->id !== $membership->eligible_age_bracket_id) {
                    $violations[] = "\"{$membership->name}\" requires age group: {$requiredBracket?->label}.";
                }
            }

            if ($membership->eligible_civil_status_id) {
                $requiredStatus = $membership->eligibleCivilStatus;
                if (!$civilStatusId || $civilStatusId !== $membership->eligible_civil_status_id) {
                    $violations[] = "\"{$membership->name}\" requires civil status: {$requiredStatus?->label}.";
                }
            }

            if ($membership->eligible_current_status_id) {
                $requiredCurrentStatus = $membership->eligibleCurrentStatus;
                if (!in_array($membership->eligible_current_status_id, $currentStatusIds, true)) {
                    $violations[] = "\"{$membership->name}\" requires current status: {$requiredCurrentStatus?->label}.";
                }
            }

            if ($membership->eligible_gender) {
                if (!$gender || $gender !== $membership->eligible_gender) {
                    $violations[] = "\"{$membership->name}\" requires gender: {$membership->eligible_gender}.";
                }
            }
        }

        return empty($violations) ? null : $violations;
    }

    // =========================
    // CREATE USER
    // =========================

        public function store(StoreUserRequest $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // New records are always residents. Making someone Staff is a separate,
        // password-confirmed action that only the Head Staff has (Staff Accounts).
        if ($request->role === 'Staff') {
            return response()->json([
                'message' => 'Staff access is granted by the Head Staff from the Staff Accounts page.',
                'errors' => ['role' => ['Staff access is granted by the Head Staff from the Staff Accounts page.']],
            ], 403);
        }

        // ✅ DUPLICATE NAME CHECK (STORE)
        $exists = User::whereRaw('LOWER(TRIM(first_name)) = ?', [mb_strtolower(trim($request->first_name))])
            ->whereRaw('LOWER(TRIM(last_name)) = ?', [mb_strtolower(trim($request->last_name))])
            ->whereRaw('LOWER(TRIM(COALESCE(middle_name, ""))) = ?', [mb_strtolower(trim($request->middle_name ?? ''))])
            ->whereRaw('LOWER(TRIM(COALESCE(suffix, ""))) = ?', [mb_strtolower(trim($request->suffix ?? ''))])
            ->whereNull('deleted_at')
            ->exists();

        if ($exists) {
            return response()->json([
                'errors' => [
                    'last_name' => ['A record with this full name already exists.']
                ]
            ], 422);
        }

        // Adviser example (Senior Citizen) -- block assigning an eligibility-gated
        // membership (Youth / Senior Citizen / Solo Parent, etc.) to a resident
        // who doesn't match its required age bracket / civil status.
        $incomingMembershipIds = array_filter((array) $request->membership_ids);
        $incomingCurrentStatusIds = array_map('intval', array_filter((array) $request->current_status_ids));
        if (!empty($incomingMembershipIds)) {
            $violations = $this->checkMembershipEligibility(
                $incomingMembershipIds,
                $request->birth_date,
                $request->civil_status_id ? (int) $request->civil_status_id : null,
                $request->gender ?: null,
                $incomingCurrentStatusIds
            );
            if ($violations) {
                return response()->json(['errors' => ['membership_ids' => $violations]], 422);
            }
        }

        DB::beginTransaction();

        $path = null;

        try {

            $last = User::withTrashed()->latest('id')->first();
            $nextNum = $last ? ((int) str_replace('PR-', '', $last->user_code) + 1) : 1;
            $userCode = 'PR-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);

            if ($request->hasFile('validation_id')) {
                $path = $this->localUpload($request->file('validation_id'));
            }

            $hasAccount = filter_var($request->has_account, FILTER_VALIDATE_BOOLEAN);

            $user = User::create([
                'user_code'      => $userCode,
                'first_name'     => $request->first_name,
                'last_name'      => $request->last_name,
                'middle_name'    => $request->middle_name,
                'suffix'         => trim((string) $request->suffix) !== '' ? trim($request->suffix) : null,
                'contact_number' => $request->contact_number,
                'validation_id'  => $path,
                'role'           => 'Resident',
                'has_account'    => $hasAccount ? 1 : 0,
                'password'       => $hasAccount ? Hash::make($request->password) : null,
                'must_change_password' => $hasAccount ? 1 : 0,
                'birth_date'                => $request->birth_date,
                'address'                   => $request->address,
                'civil_status_id'           => $request->civil_status_id ?: null,
                'gender'                    => $request->gender ?: null,
                'household_id'               => $request->filled('household_id') ? (int) $request->household_id : null,
                'preferred_language'        => $request->preferred_language ?? 'en',
            ]);

            if (!empty($incomingCurrentStatusIds)) {
                $user->currentStatuses()->sync($incomingCurrentStatusIds);
            }

            // Barangay Captain / Secretary post (one active holder each).
            if ($request->filled('barangay_position')) {
                $taken = $this->applyBarangayPosition($user, $request);
                if ($taken) {
                    DB::rollBack();
                    if ($path) {
                        $this->localDelete($path);
                    }
                    return $this->positionTakenResponse($request->barangay_position, $taken);
                }
            }

            if (filter_var($request->is_household_head, FILTER_VALIDATE_BOOLEAN)) {
                if (!$user->household_id) {
                    DB::rollBack();
                    return response()->json([
                        'errors' => ['is_household_head' => ['Link this resident to a household before making them the head.']],
                    ], 422);
                }
                User::where('household_id', $user->household_id)->update(['is_household_head' => false]);
                $user->update(['is_household_head' => true]);

                $household = Household::find($user->household_id);
                if ($household) {
                    $household->backfillFromHead($user);
                }
            }

            if ($request->has('membership_ids')) {
                $ids = array_filter((array) $request->membership_ids);
                if (!empty($ids)) {
                    $user->memberships()->sync($ids);
                }
            }

            $this->createLog('Create User', 'User', "Created user {$user->user_code}");

            DB::commit();

            return response()->json([
                'message' => 'User created successfully',
                'user' => $user->load('memberships', 'currentStatuses')
            ], 201);

        } catch (\Exception $e) {

            DB::rollBack();

            if ($path) {
                $this->localDelete($path);
            }

            if ($this->isHeadConflict($e)) {
                return response()->json([
                    'message' => 'This household already has a head from another request just now -- please refresh and try again.',
                ], 409);
            }

            if ($this->isDuplicateNameConflict($e)) {
                return response()->json([
                    'errors' => [
                        'last_name' => ['A record with this full name already exists.']
                    ]
                ], 422);
            }

            return response()->json([
                'message' => 'Transaction failed',
                'error' => $this->safeError($e),
            ], 500);
        }
    }

    // =========================
    // LOGIN
    // =========================

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required|string|max:50',
            'password' => 'required|string|max:200',
            'otp'      => 'nullable|string|max:12',
        ]);

        $security = app(SecurityService::class);
        $username = trim((string) $request->username);
        $ip = $request->ip();
        $limiterKey = 'login:' . strtolower($username) . '|' . $ip;

        $tooMany = fn () => response()->json([
            'message' => 'Too many wrong tries. Please wait 1 minute and try again.',
            'code' => 'too_many_attempts',
        ], 429);

        // Same answer whether or not the account exists, so the lock can't be
        // used to discover which user codes are real.
        if (RateLimiter::tooManyAttempts($limiterKey, 5)) {
            return $tooMany();
        }

        $user = User::where('user_code', $username)->first();

        if ($user && $user->locked_until && $user->locked_until->isFuture()) {
            return $tooMany();
        }

        // Always do exactly one hash check -- even for an unknown user code --
        // so response time doesn't reveal whether the account exists.
        self::$dummyHash ??= Hash::make(Str::random(32));
        $hash = ($user && $user->password) ? $user->password : self::$dummyHash;
        $passwordOk = Hash::check($request->password, $hash);
        $usable = $user && $user->has_account && $user->password && !$user->suspended_at;

        if (!$passwordOk || !$usable) {
            $this->recordFailedLogin($user, $limiterKey);

            // Separate, specific messages so people know which part to fix.
            // `code` lets the screen show it in the visitor's language.
            if (!$user) {
                return response()->json(['message' => 'Username not found.', 'code' => 'username_not_found', 'field' => 'username'], 401);
            }
            if (!$user->has_account || !$user->password) {
                return response()->json(['message' => 'This username has no portal account yet. Please contact the Records Office.', 'code' => 'no_portal_account', 'field' => 'username'], 401);
            }
            if (!$passwordOk) {
                return response()->json(['message' => 'Incorrect password.', 'code' => 'wrong_password', 'field' => 'password'], 401);
            }
            // Right password, but the account is suspended.
            return response()->json(['message' => 'This account is suspended. Please contact the Head Staff.', 'code' => 'account_suspended', 'field' => 'username'], 401);
        }

        // Optional two-step login (authenticator app).
        if ($user->two_factor_confirmed_at && $user->two_factor_secret) {
            if (!$request->filled('otp')) {
                return response()->json([
                    'message' => 'Enter the 6-digit code from your authenticator app.',
                    'two_factor_required' => true,
                ], 401);
            }
            $step = Totp::verify(Crypt::decryptString($user->two_factor_secret), (string) $request->otp);
            $replayKey = 'totp-used:' . $user->id . ':' . $step;
            if ($step === null || Cache::has($replayKey)) {
                $this->recordFailedLogin($user, $limiterKey);
                return response()->json([
                    'message' => 'That code is not valid. Please try again.',
                    'two_factor_required' => true,
                ], 401);
            }
            Cache::put($replayKey, true, 180);
        }

        RateLimiter::clear($limiterKey);

        $previousIp = $user->last_login_ip;
        $user->forceFill([
            'failed_login_attempts' => 0,
            'locked_until' => null,
            'last_login_at' => now(),
            'last_login_ip' => $ip,
        ])->save();

        // "Keep me signed in" is for residents only -- staff sessions are
        // short-lived by design (see SessionGuard).
        $remember = $request->boolean('remember_me') && $user->role !== 'Staff';
        if ($remember) {
            Auth::guard('web')->setRememberDuration(60 * 24 * 30);
        }
        Auth::login($user, $remember);
        $request->session()->regenerate();
        $request->session()->put('last_activity_at', time());

        if ($user->role === 'Staff') {
            ActivityLog::create([
                'user_code'   => $user->user_code,
                'action'      => 'Login',
                'module'      => 'Authentication',
                'description' => 'Staff logged in',
            ]);

            if ($previousIp && $previousIp !== $ip) {
                $security->alert($user, 'new_login', 'Sign-in from a new network',
                    "Your account was just signed in from a different network ({$ip}). If this wasn't you, change your password now and tell the Head Staff.");
            }
        }

        return response()->json([
            'message' => 'Login successful',
            'user' => $user->fresh()
        ]);
    }

    /** Counts a failed sign-in; locks the account after repeated failures. */
    private function recordFailedLogin(?User $user, string $limiterKey): void
    {
        RateLimiter::hit($limiterKey, 60);

        if (!$user) {
            return;
        }

        $security = app(SecurityService::class);
        $user->increment('failed_login_attempts');
        $user->refresh();

        // Short, per-network lock reached (5 wrong tries in a minute) -> warn staff.
        if ($user->role === 'Staff' && RateLimiter::attempts($limiterKey) === 5) {
            $msg = "There were 5 failed sign-in attempts on {$user->user_code}. Sign-ins from that network are paused for 1 minute.";
            $security->alert($user, 'failed_logins', 'Repeated failed sign-ins', $msg);
            $security->alertHead('failed_logins', 'Repeated failed sign-ins', $msg, $user->id);
        }

        // Long, per-account lock for slow guessing spread over many networks.
        if ($user->failed_login_attempts >= 10) {
            $user->forceFill(['locked_until' => now()->addMinute(), 'failed_login_attempts' => 0])->save();
            if ($user->role === 'Staff') {
                $msg = "{$user->user_code} was locked for 1 minute after 10 failed sign-in attempts.";
                $security->alert($user, 'account_locked', 'Account locked', $msg);
                $security->alertHead('account_locked', 'Account locked', $msg, $user->id);
            }
        }
    }

    // =========================
    // GET USERS
    // =========================

    public function index(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = User::withTrashed()->with('memberships', 'household');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('user_code', 'like', "%$search%")
                  ->orWhere('first_name', 'like', "%$search%")
                  ->orWhere('last_name', 'like', "%$search%")
                  ->orWhere('middle_name', 'like', "%$search%")
                  ->orWhere('contact_number', 'like', "%$search%")
                  ->orWhere('role', 'like', "%$search%");
            });
        }

        // Adviser recommendation: "Profiling (Filter for Age)"
        if ($request->filled('age_group')) {
            $ranges = [
                'child'  => [0, 12],
                'youth'  => [13, 17],
                'adult'  => [18, 59],
                'senior' => [60, 150],
            ];
            $range = $ranges[strtolower($request->age_group)] ?? null;
            if ($range) {
                $query->whereNotNull('birth_date')
                    ->whereRaw('TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) BETWEEN ? AND ?', $range);
            }
        }

        if ($request->filled('household_id')) {
            $query->where('household_id', $request->household_id);
        }

        return response()->json($query->paginate((int) $request->get('per_page', 20)));
    }

    // =========================
    // SHOW USER
    // =========================

    public function show($id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            User::withTrashed()->with('memberships', 'household')->findOrFail($id)
        );
    }

    // =========================
    // UPDATE USER
    // =========================

     public function update(UpdateUserRequest $request, $id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        DB::beginTransaction();

        try {

            // ✅ DUPLICATE NAME CHECK (UPDATE)
            $exists = User::whereRaw('LOWER(TRIM(first_name)) = ?', [mb_strtolower(trim($request->first_name))])
                ->whereRaw('LOWER(TRIM(last_name)) = ?', [mb_strtolower(trim($request->last_name))])
                ->whereRaw('LOWER(TRIM(COALESCE(middle_name, ""))) = ?', [mb_strtolower(trim($request->middle_name ?? ''))])
                ->whereRaw('LOWER(TRIM(COALESCE(suffix, ""))) = ?', [mb_strtolower(trim($request->suffix ?? ''))])
                ->whereNull('deleted_at')
                ->where('id', '!=', $id)
                ->exists();

            if ($exists) {
                return response()->json([
                    'errors' => [
                        'last_name' => ['A record with this full name already exists.']
                    ]
                ], 422);
            }

            $user = User::findOrFail($id);

            if ($this->isStaff() && $request->has('membership_ids')) {
                $incomingMembershipIds = array_filter((array) $request->membership_ids);
                if (!empty($incomingMembershipIds)) {
                    $effectiveBirthDate = $request->filled('birth_date')
                        ? $request->birth_date
                        : optional($user->birth_date)->format('Y-m-d');
                    $effectiveCivilStatusId = $request->has('civil_status_id')
                        ? ($request->civil_status_id ? (int) $request->civil_status_id : null)
                        : $user->civil_status_id;
                    $effectiveCurrentStatusIds = $request->has('current_status_ids')
                        ? array_map('intval', array_filter((array) $request->current_status_ids))
                        : $user->getRelationValue('currentStatuses')->pluck('id')->all();
                    $effectiveGender = $request->has('gender')
                        ? ($request->gender ?: null)
                        : $user->gender;

                    $violations = $this->checkMembershipEligibility(
                        $incomingMembershipIds,
                        $effectiveBirthDate,
                        $effectiveCivilStatusId,
                        $effectiveGender,
                        $effectiveCurrentStatusIds
                    );
                    if ($violations) {
                        DB::rollBack();
                        return response()->json(['errors' => ['membership_ids' => $violations]], 422);
                    }
                }
            }

            $user->fill($request->only([
                'first_name',
                'last_name',
                'middle_name',
                'suffix',
                'contact_number',
                'birth_date',
                'address',
                'civil_status_id',
                'gender',
                'preferred_language',
            ]));

            // Barangay Captain / Secretary post -- staff only. Sent as an empty
            // string to clear the post; absent means "leave it alone".
            if ($this->isStaff() && $request->has('barangay_position')) {
                $newPosition = $request->filled('barangay_position') ? $request->barangay_position : null;
                if ($newPosition !== $user->barangay_position) {
                    $taken = $this->applyBarangayPosition($user, $request);
                    if ($taken) {
                        DB::rollBack();
                        return $this->positionTakenResponse($newPosition, $taken);
                    }
                }
            }

            // Both blocks below are staff-only, same as role/has_account/
            // membership_ids just further down -- a resident hitting this
            // endpoint for their own profile (isOwnProfile() passes the
            // gate at the top of this method) must not be able to link
            // themselves into an arbitrary household or flag themselves as
            // its head, which would also silently demote whoever the real
            // head was.
            if ($this->isStaff() && $request->has('household_id')) {
                $originalHouseholdId = $user->household_id;
                $user->household_id = $request->filled('household_id') ? (int) $request->household_id : null;

                // Unlinking, or moving to a different household, clears any
                // stale head flag -- "head of household" is meaningless once
                // detached from the household it applied to, and silently
                // carrying it over to a new household could double it up
                // with whoever is already the head there. A request that
                // wants the head flag re-applied to the new household sends
                // is_household_head explicitly alongside household_id, which
                // the block below still honors.
                if ($user->household_id !== $originalHouseholdId) {
                    $user->is_household_head = false;
                }
            }

            if ($this->isStaff() && $request->has('is_household_head')) {
                $wantsHead = filter_var($request->is_household_head, FILTER_VALIDATE_BOOLEAN);

                if ($wantsHead && !$user->household_id) {
                    DB::rollBack();
                    return response()->json([
                        'errors' => ['is_household_head' => ['Link this resident to a household before making them the head.']],
                    ], 422);
                }

                if ($wantsHead) {
                    // Only one head per household -- clear any stale flag first.
                    User::where('household_id', $user->household_id)
                        ->where('id', '!=', $user->id)
                        ->update(['is_household_head' => false]);
                }

                $user->is_household_head = $wantsHead;
            }

        // The role can't be changed from this form. Promoting or demoting a staff
        // member is a password-confirmed Head Staff action (Staff Accounts).
        if ($request->filled('role') && $request->role !== $user->role) {
            DB::rollBack();
            return response()->json([
                'message' => 'Staff access is changed by the Head Staff from the Staff Accounts page.',
                'errors' => ['role' => ['Staff access is changed by the Head Staff from the Staff Accounts page.']],
            ], 403);
        }

        // Passwords: your own is changed in My Account (asks for the current
        // password); a staff member's can only be reset by the Head Staff.
        if ($request->filled('password')) {
            if ($this->isOwnProfile($id)) {
                DB::rollBack();
                return response()->json([
                    'errors' => ['password' => ['Change your own password from My Account, where the current password is required.']],
                ], 422);
            }
            if ($user->role === 'Staff') {
                DB::rollBack();
                return response()->json([
                    'errors' => ['password' => ['A staff password can only be reset by the Head Staff from the Staff Accounts page.']],
                ], 403);
            }
        }

            // Account access rules (staff-managed; the frontend mirrors these
            // but this is the source of truth):
            //   - an existing account can be password-reset but never removed
            //   - a resident without an account can be granted one, which
            //     requires a password in the same request
            //   - a resident editing their own profile can never grant or
            //     revoke account access, only change their own password
            $wantsAccount = $request->has('has_account')
                ? filter_var($request->has_account, FILTER_VALIDATE_BOOLEAN)
                : (bool) $user->has_account;

            if ($this->isStaff()) {
                if ($user->has_account && !$wantsAccount) {
                    DB::rollBack();
                    return response()->json([
                        'errors' => ['has_account' => ["An existing account can't be removed. You can only reset its password."]],
                    ], 422);
                }

                if (!$user->has_account && $wantsAccount) {
                    if (!$request->filled('password')) {
                        DB::rollBack();
                        return response()->json([
                            'errors' => ['password' => ['A password is required to create this resident\'s account.']],
                        ], 422);
                    }
                    $user->has_account = 1;
                    $user->password = Hash::make($request->password);
                    $user->must_change_password = true;
                    $this->createLog('Account Created', 'User', "Created a portal account for {$user->user_code}");
                } elseif ($user->has_account && $request->filled('password')) {
                    $user->password = Hash::make($request->password);
                    $user->must_change_password = true;
                    $user->password_changed_at = null;
                    $this->createLog('Password Reset', 'User', "Reset the password of {$user->user_code}");
                }
            }

            if ($request->hasFile('validation_id')) {
                if ($user->validation_id) {
                    $this->localDelete($user->validation_id);
                }
                $user->validation_id = $this->localUpload($request->file('validation_id'));
            }

            $user->save();

            // Whether this request just made them head or they already
            // were one, keep the household's own address/contact number
            // filled in from whatever the head's Residents-page record
            // now has -- but only for a field the household doesn't
            // already have its own value for (see backfillFromHead()).
            if ($user->is_household_head && $user->household_id) {
                $household = Household::find($user->household_id);
                if ($household) {
                    $household->backfillFromHead($user);
                }
            }

            if ($this->isStaff() && $request->has('membership_ids')) {
                $ids = array_filter((array) $request->membership_ids);

                if (empty($ids)) {
                    $user->memberships()->detach();
                } else {
                    $user->memberships()->sync($ids);
                }
            }

            if ($request->has('current_status_ids')) {
                $statusIds = array_map('intval', array_filter((array) $request->current_status_ids));
                $user->currentStatuses()->sync($statusIds);
            }

            $this->createLog('Update User', 'User', "Updated user {$user->user_code}");

            DB::commit();

            return response()->json([
                'message' => 'User updated successfully',
                'user' => $user->load('memberships', 'currentStatuses')
            ]);

        } catch (\Exception $e) {

            DB::rollBack();

            if ($this->isHeadConflict($e)) {
                return response()->json([
                    'message' => 'This household already has a head from another request just now -- please refresh and try again.',
                ], 409);
            }

            if ($this->isDuplicateNameConflict($e)) {
                return response()->json([
                    'errors' => [
                        'last_name' => ['A record with this full name already exists.']
                    ]
                ], 422);
            }

            return response()->json([
                'message' => 'Update failed',
                'error' => $this->safeError($e),
            ], 500);
        }
    }

    // =========================
    // DELETE USER
    // =========================

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        DB::beginTransaction();

        try {

            $user = User::findOrFail($id);

            if ((int) $user->id === (int) auth()->id()) {
                DB::rollBack();
                return response()->json(['message' => "You can't archive your own account."], 422);
            }
            if ($user->is_head_staff) {
                DB::rollBack();
                return response()->json(['message' => "The Head Staff can't be archived. Transfer the Head Staff role first."], 422);
            }
            if ($user->role === 'Staff' && !auth()->user()->is_head_staff) {
                DB::rollBack();
                return response()->json(['message' => 'Only the Head Staff can archive a staff account.'], 403);
            }

            // A soft-deleted resident can't stay "head of household" -- it
            // blocks the household from ever getting a new head (only one
            // head per household is allowed) and would show a deleted
            // resident as the active head if the household is viewed
            // before this record is restored.
            $headOfHouseholdId = null;
            if ($user->is_household_head) {
                $headOfHouseholdId = $user->household_id;
                $user->is_household_head = false;
            }

            // Likewise an archived resident can't keep the Barangay Captain /
            // Secretary post -- clear it now so a successor can be named, and
            // so restoring this record later can't create a second holder.
            if ($user->barangay_position) {
                $this->createLog(
                    'Barangay Position',
                    'User',
                    "{$user->user_code} stepped down as " . (BarangayOfficials::TITLES[$user->barangay_position] ?? $user->barangay_position) . ' (record archived)'
                );
                $user->barangay_position = null;
            }

            // ✅ STORE WHO DELETED IT
            $user->deleted_by = auth()->user()->user_code;
            $user->save();

            if ($user->role === 'Staff') {
                app(SecurityService::class)->revokeSessions($user);
            }

            // ✅ SOFT DELETE
            $user->delete();

            $this->createLog(
                'Delete User',
                'User',
                "Deleted user {$user->user_code} by " . auth()->user()->user_code
            );

            // The household just lost its head -- leave a warning in the
            // activity log (the staff Notifications "Household alerts" tab
            // and the Households page banner pick it up live).
            if ($headOfHouseholdId) {
                $hh = Household::find($headOfHouseholdId);
                if ($hh) {
                    $this->createLog(
                        'Warning',
                        'Households',
                        "Household '{$hh->code}' lost its head of household ({$user->user_code} was archived) -- assign a new head so event SMS keeps reaching it"
                    );
                }
            }

            DB::commit();

            return response()->json([
                'message' => 'Deleted successfully'
            ]);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Delete failed',
                'error' => $this->safeError($e)
            ], 500);
        }
    }
    // =========================
    // RESTORE USER
    // =========================

    public function restore($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = User::onlyTrashed()->findOrFail($id);
        $user->restore();

        $this->createLog(
            'Restore User',
            'User',
            "Restored user {$user->user_code}"
        );

        return response()->json(['message' => 'Restored successfully']);
    }

    // =========================
    // FORCE DELETE
    // =========================

    public function forceDelete($id)
    {
        // Permanent deletion is switched off for everyone, Head Staff included.
        // Records are archived and kept for transparency.
        return response()->json(['message' => 'Permanent deletion is disabled. Records are archived and kept.'], 403);
    }

    // =========================
    // CHANGE PASSWORD
    // =========================

    public function changePassword(Request $request, $id)
    {
        // Everyone changes their OWN password here. Resetting someone else's
        // is a separate, logged action (Head Staff for staff accounts; the
        // resident edit form for residents).
        if (!$this->isOwnProfile($id)) {
            return response()->json(['message' => 'You can only change your own password here.'], 403);
        }

        $me = auth()->user();
        $security = app(SecurityService::class);

        $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => [
                'required', 'string', 'confirmed',
                new \App\Rules\StrongPassword($me->is_head_staff ? 12 : \App\Rules\StrongPassword::MIN),
            ],
        ]);

        $security->requirePassword($me, $request->current_password, 'current_password');

        if (Hash::check($request->new_password, $me->password)) {
            return response()->json([
                'errors' => ['new_password' => ['Your new password must be different from the current one.']],
            ], 422);
        }

        DB::beginTransaction();

        try {

            $user = User::findOrFail($id);
            $user->password = Hash::make($request->new_password);
            $user->has_account = 1;
            $user->must_change_password = false;
            $user->password_changed_at = now();
            $user->save();

            // Sign out every OTHER device -- an old or stolen session dies here.
            $security->revokeSessions($user, $request->session()->getId());

            $this->createLog(
                'Change Password',
                'User',
                "Changed password for user {$user->user_code}"
            );

            if ($user->role === 'Staff') {
                $security->alert($user, 'password_changed', 'Password changed',
                    'Your password was changed and all other devices were signed out. If this was not you, contact the Head Staff immediately.');
            }

            DB::commit();

            return response()->json(['message' => 'Password updated successfully']);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Password update failed',
                'error' => $this->safeError($e),
            ], 500);
        }
    }

    // =========================
    // SELF-SERVICE: CONTACT NUMBER
    // =========================
    // Deliberately its own small endpoint rather than routing residents
    // through the full staff-facing update() above -- that one expects
    // (and duplicate-name-checks against) a whole resident record, which
    // is the wrong shape for "a resident edits one field of their own
    // profile".
    public function updateContactNumber(Request $request, $id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'contact_number' => [
                'required',
                'string',
                function ($attribute, $value, $fail) {
                    // Exactly 11 digits starting with 09 (e.g. 09171234567).
                    $stripped = preg_replace('/\D/', '', $value);
                    if (!preg_match('/^09\d{9}$/', $stripped)) {
                        $fail('Contact number must be exactly 11 digits and start with 09.');
                    }
                },
            ],
        ]);

        $user = User::findOrFail($id);
        $user->contact_number = preg_replace('/\D/', '', $request->contact_number);
        $user->save();

        $this->createLog(
            'Update',
            'User',
            "Updated contact number for user {$user->user_code}"
        );

        return response()->json([
            'message' => 'Contact number updated successfully',
            'contact_number' => $user->contact_number,
        ]);
    }

    // =========================
    // LOGOUT
    // =========================

    public function logout(Request $request)
    {
        $user = auth()->user();

        // Log only Staff logout
        if ($user && $user->role === 'Staff') {
            ActivityLog::create([
                'user_code'   => $user->user_code,
                'action'      => 'Logout',
                'module'      => 'Authentication',
                'description' => 'Staff logged out',
            ]);
        }

        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Logged out successfully'
        ]);
    }
    // =========================
    // CURRENT USER
    // =========================

    public function me(Request $request)
    {
        return response()->json(
            $request->user()->load('memberships', 'household')
        );
    }

    // Add this method to your UserController.php after the index() method

public function getAllForMemberships()
{
    if (!$this->isStaff()) {
        return response()->json(['message' => 'Unauthorized'], 403);
    }

    try {
        $users = User::withTrashed()
            ->with('memberships', 'household', 'currentStatuses')
            ->get();

        return response()->json(
            $users->map(function ($user) {
                return [
                    'id' => $user->id,
                    'user_code' => $user->user_code,
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name,
                    'middle_name' => $user->middle_name,
                    'contact_number' => $user->contact_number,
                    'role' => $user->role,
                    'has_account' => $user->has_account,
                    'deleted_at' => $user->deleted_at,
                    'birth_date' => $user->birth_date?->format('Y-m-d'),
                    'age' => $user->age,
                    'age_group' => $user->age_group,
                    'address' => $user->address,
                    'civil_status_id' => $user->civil_status_id,
                    'current_status_ids' => $user->getRelationValue('currentStatuses')->pluck('id'),
                    'gender' => $user->gender,
                    'is_household_head' => $user->is_household_head,
                    'household_id' => $user->household_id,
                    'household' => $user->household ? [
                        'id' => $user->household->id,
                        'code' => $user->household->code,
                    ] : null,
                    'preferred_language' => $user->preferred_language,
                    'memberships' => $user->memberships->map(function ($membership) {
                        return [
                            'id' => $membership->id,
                            'name' => $membership->name,
                            'description' => $membership->description,
                        ];
                    }),
                    'validation_id_url' => $user->validation_id_url,
                ];
            })
        );

    } catch (\Exception $e) {
        \Log::error('getAllForMemberships error: ' . $e->getMessage());
        return response()->json([
            'message' => 'Failed to fetch users for memberships',
            'error' => $this->safeError($e)
        ], 500);
    }
}
}

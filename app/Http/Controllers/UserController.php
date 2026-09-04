<?php

namespace App\Http\Controllers;

use App\Models\User;
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

class UserController extends Controller
{
    // =========================
    // HELPERS
    // =========================

    private function isStaff()
    {
        return auth()->user()?->role === 'Staff';
    }

    private function isOwnProfile($id)
    {
        return auth()->id() == $id;
    }

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

    private function createLog($action, $module, $description)
    {
        ActivityLog::create([
            'user_code'   => auth()->user()?->user_code ?? 'SYSTEM',
            'action'      => $action,
            'module'      => $module,
            'description' => $description,
        ]);
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

        // ✅ DUPLICATE NAME CHECK (STORE)
        $exists = User::whereRaw('LOWER(TRIM(first_name)) = ?', [mb_strtolower(trim($request->first_name))])
            ->whereRaw('LOWER(TRIM(last_name)) = ?', [mb_strtolower(trim($request->last_name))])
            ->whereRaw('LOWER(TRIM(COALESCE(middle_name, ""))) = ?', [mb_strtolower(trim($request->middle_name ?? ''))])
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
                'contact_number' => $request->contact_number,
                'validation_id'  => $path,
                'role'           => $request->role,
                'has_account'    => $hasAccount ? 1 : 0,
                'password'       => $hasAccount ? Hash::make($request->password) : null,
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

            if (filter_var($request->is_household_head, FILTER_VALIDATE_BOOLEAN)) {
                if (!$user->household_id) {
                    DB::rollBack();
                    return response()->json([
                        'errors' => ['is_household_head' => ['Link this resident to a household before making them the head.']],
                    ], 422);
                }
                User::where('household_id', $user->household_id)->update(['is_household_head' => false]);
                $user->update(['is_household_head' => true]);
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

            return response()->json([
                'message' => 'Transaction failed',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // =========================
    // LOGIN
    // =========================

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required',
            'password' => 'required',
        ]);

        $user = User::where('user_code', $request->username)->first();

        if (!$user || !$user->has_account) {
            return response()->json(['message' => 'Account not activated'], 401);
        }

        if (!Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        Auth::login($user, $request->boolean('remember_me'));
        $request->session()->regenerate();

        // Log only Staff login
        if ($user->role === 'Staff') {
            ActivityLog::create([
                'user_code'   => $user->user_code,
                'action'      => 'Login',
                'module'      => 'Authentication',
                'description' => 'Staff logged in',
            ]);
        }

        return response()->json([
            'message' => 'Login successful',
            'user' => $user
        ]);
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

        if ($request->filled('household_code')) {
            $query->where('household_code', $request->household_code);
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
                'contact_number',
                'birth_date',
                'address',
                'civil_status_id',
                'gender',
                'preferred_language',
            ]));

            if ($request->has('household_id')) {
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

            if ($request->has('is_household_head')) {
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

        if ($this->isStaff() && $request->filled('role')) {
            if ($user->role !== $request->role) {
                $oldRole = $user->role;
                $user->role = $request->role;
                $this->createLog(
                    'Role Change',
                    'User',
                    "Changed role of {$user->user_code} from {$oldRole} to {$request->role}"
                );
            } else {
                $user->role = $request->role;
            }
        }

            if ($request->has('has_account')) {
                $user->has_account = filter_var($request->has_account, FILTER_VALIDATE_BOOLEAN);
            }

            if ($request->filled('password')) {
                $user->password = Hash::make($request->password);
                $user->has_account = 1;
            }

            if ($request->hasFile('validation_id')) {
                if ($user->validation_id) {
                    $this->localDelete($user->validation_id);
                }
                $user->validation_id = $this->localUpload($request->file('validation_id'));
            }

            $user->save();

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

            return response()->json([
                'message' => 'Update failed',
                'error' => $e->getMessage(),
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

            // ✅ STORE WHO DELETED IT
            $user->deleted_by = auth()->user()->user_code;
            $user->save();

            // ✅ SOFT DELETE
            $user->delete();

            $this->createLog(
                'Delete User',
                'User',
                "Deleted user {$user->user_code} by " . auth()->user()->user_code
            );

            DB::commit();

            return response()->json([
                'message' => 'Deleted successfully'
            ]);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Delete failed',
                'error' => $e->getMessage()
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
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        DB::beginTransaction();

        try {

            $user = User::onlyTrashed()->findOrFail($id);

            if ($user->validation_id) {
                $this->localDelete($user->validation_id);
            }

            $user->memberships()->detach();

            $this->createLog(
                'Force Delete User',
                'User',
                "Permanently deleted user {$user->user_code}"
            );

            $user->forceDelete();

            DB::commit();

            return response()->json(['message' => 'Permanently deleted']);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Force delete failed',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // =========================
    // CHANGE PASSWORD
    // =========================

    public function changePassword(Request $request, $id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'new_password' => 'required|string|min:8|confirmed',
        ]);

        DB::beginTransaction();

        try {

            $user = User::findOrFail($id);
            $user->password = Hash::make($request->new_password);
            $user->has_account = 1;
            $user->save();

            $this->createLog(
                'Change Password',
                'User',
                "Changed password for user {$user->user_code}"
            );

            DB::commit();

            return response()->json(['message' => 'Password updated successfully']);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Password update failed',
                'error' => $e->getMessage(),
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
                    $stripped = preg_replace('/\D/', '', $value);
                    if (!preg_match('/^(\+?63|0)9\d{9}$/', $stripped)) {
                        $fail('The contact number format is invalid.');
                    }
                },
            ],
        ]);

        $user = User::findOrFail($id);
        $user->contact_number = $request->contact_number;
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
                    'household_code' => $user->household_code,
                    'is_household_head' => $user->is_household_head,
                    'household_contact_number' => $user->household_contact_number,
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
            'error' => $e->getMessage()
        ], 500);
    }
}
}

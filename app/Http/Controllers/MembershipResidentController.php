<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\MembershipResident;
use App\Models\AgeBracket;
use App\Support\Paged;

class MembershipResidentController extends Controller
{
    // =========================
    // AUTH HELPERS
    // =========================

    private function isOwnProfile($id)
    {
        return auth()->id() == $id;
    }

    // =========================
    // GET ALL ACTIVE USERS + MEMBERSHIPS
    // NOTE: despite the 'deleted_at' field below, this does NOT include
    // soft-deleted (archived) users -- User::with(...)->get() applies
    // Eloquent's default SoftDeletes scope, so 'deleted_at' here will
    // always come back null. This feeds the staff Scan page's resident
    // list (Staff.tsx -> ScanView), so an archived resident's QR/manual
    // ID currently won't match here and the scan is rejected as unknown.
    // If archived residents should still be scannable (e.g. to show a
    // "this resident was archived" message instead of "not found"), add
    // ->withTrashed() and have ScanView/resolveAndSetScan branch on
    // deleted_at -- don't just enable it blindly, since as written the
    // frontend has no "archived" check and would silently let a removed
    // resident be marked present. See show() below for the equivalent
    // single-user lookup, which deliberately DOES include soft-deleted
    // users via a raw, unscoped query.
    // =========================

public function index(Request $request)
{
    // Every row carries other residents' personal details (contact number, address,
    // birth date, ID photo) -- staff only. A resident reads their own record through
    // show() instead.
    if (!$this->isStaff()) {
        return response()->json(['message' => 'Unauthorized'], 403);
    }

    // paged=1   -> one page of the Residents list, filtered and sorted here.
    // filtered=1 -> every row matching the same filters (used by the export).
    // neither   -> everyone, as before (Scan, pickers, lookups).
    if ($request->boolean('paged') || $request->boolean('filtered')) {
        return $this->filteredResponse($request);
    }

    $users = User::with('memberships', 'household', 'currentStatuses')->get();

    return response()->json($users->map(fn ($user) => $this->row($user)));
}

/** The Residents screen's filters, as one database query. */
private function filteredQuery(Request $request)
{
    $query = User::query()->with('memberships', 'household', 'currentStatuses');

    // Quick tab: has at least one membership / has none yet.
    $scope = $request->input('scope');
    if ($scope === 'members') {
        $query->whereHas('memberships');
    } elseif ($scope === 'not-members') {
        $query->whereDoesntHave('memberships');
    }

    if ($request->filled('gender')) {
        $query->where('gender', $request->input('gender'));
    }
    if ($request->filled('civil')) {
        $query->where('civil_status_id', (int) $request->input('civil'));
    }
    if ($request->filled('current')) {
        $statusId = (int) $request->input('current');
        $query->whereHas('currentStatuses', fn ($q) => $q->where('current_statuses.id', $statusId));
    }
    if ($request->filled('membership')) {
        $name = (string) $request->input('membership');
        $query->whereHas('memberships', fn ($q) => $q->where('memberships.name', $name));
    }
    if ($request->filled('age')) {
        $this->applyAgeGroup($query, (string) $request->input('age'));
    }

    // Search: every word must be found in the name, ID, contact, role, position or a membership.
    $positions = [
        'captain' => 'barangay captain punong barangay',
        'secretary' => 'barangay secretary kalihim',
    ];
    foreach (Paged::tokens($request->input('search')) as $word) {
        $like = Paged::like($word);
        $query->where(function ($q) use ($like, $word, $positions) {
            $q->whereRaw("LOWER(CONCAT_WS(' ', user_code, first_name, middle_name, last_name, suffix, contact_number, role)) LIKE ?", [$like])
              ->orWhereHas('memberships', fn ($m) => $m->whereRaw('LOWER(memberships.name) LIKE ?', [$like]));
            $matched = array_keys(array_filter($positions, fn ($text) => str_contains($text, $word)));
            if ($matched) {
                $q->orWhereIn('barangay_position', $matched);
            }
        });
    }

    return $query;
}

/** Age group = one of the staff-set age brackets (or the old fixed bands), as a birth-date range. */
private function applyAgeGroup($query, string $label): void
{
    $brackets = AgeBracket::allCached();
    $inRange = function ($q, ?int $min, ?int $max) {
        // age >= min  <=>  born on or before today minus min years; age <= max  <=>  born after today minus (max + 1) years.
        $q->whereNotNull('birth_date')->where('birth_date', '<=', now()->subYears($min ?? 0)->toDateString());
        if ($max !== null) {
            $q->where('birth_date', '>', now()->subYears($max + 1)->toDateString());
        }
    };

    $target = $brackets->firstWhere('label', $label);
    if ($target) {
        $query->where(function ($q) use ($brackets, $target, $inRange) {
            $inRange($q, $target->min_age, $target->max_age);
            // A person who fits an earlier bracket belongs to that one (see AgeBracket::resolveForAge).
            foreach ($brackets as $earlier) {
                if ($earlier->id === $target->id) {
                    break;
                }
                $q->whereNot(fn ($n) => $inRange($n, $earlier->min_age, $earlier->max_age));
            }
        });

        return;
    }

    if ($brackets->isEmpty()) {
        $bands = ['Child' => [0, 12], 'Youth' => [13, 17], 'Adult' => [18, 59], 'Senior Citizen' => [60, null]];
        if (isset($bands[$label])) {
            $query->where(fn ($q) => $inRange($q, $bands[$label][0], $bands[$label][1]));

            return;
        }
    }

    $query->whereRaw('1 = 0'); // an unknown group matches nobody
}

private function applySort($query, ?string $sort): void
{
    switch ($sort) {
        case 'name-az':
            $query->orderBy('last_name')->orderBy('first_name');
            break;
        case 'name-za':
            $query->orderBy('last_name', 'desc')->orderBy('first_name', 'desc');
            break;
        case 'age-young':
            $query->orderByRaw('birth_date IS NULL')->orderBy('birth_date', 'desc')->orderBy('last_name');
            break;
        case 'age-old':
            $query->orderByRaw('birth_date IS NULL')->orderBy('birth_date')->orderBy('last_name');
            break;
        case 'oldest':
            $query->orderBy('id');
            break;
        default: // recently added
            $query->orderBy('id', 'desc');
    }
}

private function filteredResponse(Request $request)
{
    $query = $this->filteredQuery($request);
    $this->applySort($query, $request->input('sort'));

    if ($request->boolean('filtered')) {
        return response()->json($query->get()->map(fn ($user) => $this->row($user)));
    }

    $paginator = $query->paginate(Paged::perPage($request), ['*'], 'page', Paged::page($request));

    // Sizes of the quick tabs (all active residents, not narrowed by the other filters).
    $members = User::whereHas('memberships')->count();
    $all = User::count();

    return response()->json(Paged::body(
        $paginator,
        $paginator->getCollection()->map(fn ($user) => $this->row($user))->values(),
        ['totals' => ['all' => $all, 'members' => $members, 'not_members' => $all - $members]]
    ));
}

private function row(User $user): array
{
    return [
        'user_id' => $user->id,
        'id' => $user->id,
        'user_code' => $user->user_code,
        'first_name' => $user->first_name,
        'middle_name' => $user->middle_name,
        'last_name' => $user->last_name,
        'suffix' => $user->suffix,
        'contact_number' => $user->contact_number,
        'role' => $user->role,
        'barangay_position' => $user->barangay_position,
        'has_account' => $user->has_account,

        // Always null in practice -- see note above the index()
        // signature; the query already excludes trashed rows.
        'deleted_at' => $user->deleted_at,

        'memberships' => $user->memberships,
        'validation_id_url' => $user->validation_id
            ? asset('storage/' . $user->validation_id)
            : null,

        // Adviser recommendations: age profiling + household SMS notify
        'birth_date' => $user->birth_date?->format('Y-m-d'),
        'age' => $user->age,
        'age_group' => $user->age_group,
        'address' => $user->address,
        'civil_status_id' => $user->civil_status_id,
        'civil_status' => $user->civil_status,
        'current_status_ids' => $user->getRelationValue('currentStatuses')->pluck('id'),
        'current_statuses' => $user->current_statuses,
        'gender' => $user->gender,
        // Real Household module -- household_code/household_contact_number
        // were the old free-text pair that never actually linked to
        // a real household record; household_id (via the household
        // relation below) is the real, interrelated source of truth.
        'is_household_head' => $user->is_household_head,
        'household_id' => $user->household_id,
        'household' => $user->household ? [
            'id' => $user->household->id,
            'code' => $user->household->code,
            'address' => $user->household->address,
        ] : null,
    ];
}
// =========================
    // SHOW SINGLE USER + MEMBERSHIPS (INCLUDING SOFT DELETED)
    // =========================

    public function show($id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: You can only view your own memberships'
            ], 403);
        }

        $data = DB::table('users')
            // 🔥 NO FILTER → includes deleted users too
            ->leftJoin('membership_residents', 'users.id', '=', 'membership_residents.user_id')
            ->leftJoin('memberships', 'membership_residents.membership_id', '=', 'memberships.id')
            ->select(
                'users.id',
                'users.user_code',
                'users.first_name',
                'users.middle_name',
                'users.last_name',
                'users.suffix',
                'users.contact_number',
                'users.has_account',
                'users.role', // ✅ ADDED ROLE HERE
                'users.deleted_at',

                'memberships.id as membership_id',
                'memberships.name as membership_name'
            )
            ->where('users.id', $id)
            ->get();

        if ($data->isEmpty()) {
            return response()->json([
                'message' => 'User not found'
            ], 404);
        }

        $first = $data->first();

        return response()->json([
            'user_id' => $first->id,
            'user_code' => $first->user_code,
            'first_name' => $first->first_name,
            'middle_name' => $first->middle_name,
            'last_name' => $first->last_name,
            'suffix' => $first->suffix,
            'contact_number' => $first->contact_number,
            'has_account' => $first->has_account,
            'role' => $first->role, // ✅ RETURN ROLE IN RESPONSE

            // 🔥 soft delete status
            'is_deleted' => $first->deleted_at ? true : false,

            'memberships' => $data
                ->filter(fn ($i) => $i->membership_id)
                ->map(fn ($i) => [
                    'id' => $i->membership_id,
                    'name' => $i->membership_name,
                ])
                ->values()
        ]);
    }

    // =========================
    // ASSIGN MEMBERSHIPS
    // =========================

    public function store(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $request->validate([
            'user_id' => 'required|exists:users,id',
            'membership_ids' => 'required|array|min:1',
            'membership_ids.*' => 'exists:memberships,id',
        ]);

        foreach ($request->membership_ids as $membershipId) {
            MembershipResident::create([
                'user_id' => $request->user_id,
                'membership_id' => $membershipId,
            ]);
        }

        return response()->json([
            'message' => 'Memberships assigned successfully'
        ], 201);
    }

    // =========================
    // UPDATE MEMBERSHIPS
    // =========================

    public function update(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $request->validate([
            'membership_ids' => 'required|array|min:1',
            'membership_ids.*' => 'exists:memberships,id',
        ]);

        MembershipResident::where('user_id', $id)->delete();

        foreach ($request->membership_ids as $membershipId) {
            MembershipResident::create([
                'user_id' => $id,
                'membership_id' => $membershipId,
            ]);
        }

        return response()->json([
            'message' => 'Memberships updated successfully'
        ]);
    }

    // =========================
    // DELETE MEMBERSHIPS
    // =========================

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        MembershipResident::where('user_id', $id)->delete();

        return response()->json([
            'message' => 'Memberships deleted successfully'
        ]);
    }

    // =========================
    // PAGINATED USER MEMBERSHIPS
    // =========================

    public function getUserMembershipsPaginated($id, Request $request)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $perPage = $request->get('per_page', 6);
        $search = $request->get('search', '');

        $user = User::findOrFail($id);

        $query = DB::table('membership_residents')
            ->join('memberships', 'membership_residents.membership_id', '=', 'memberships.id')
            ->select('memberships.id', 'memberships.name', 'memberships.description')
            ->where('membership_residents.user_id', $id);

        if ($search) {
            $query->where('memberships.name', 'like', "%{$search}%");
        }

        $memberships = $query->paginate($perPage);

        return response()->json([
            'user_code' => $user->user_code,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'contact_number' => $user->contact_number,
            'has_account' => $user->has_account,
            'role' => $user->role, // ✅ ADDED ROLE HERE TOO
            'is_deleted' => $user->deleted_at ? true : false,

            'memberships' => $memberships->items(),
            'current_page' => $memberships->currentPage(),
            'last_page' => $memberships->lastPage(),
            'total' => $memberships->total(),
            'per_page' => $memberships->perPage(),
        ]);
    }
}


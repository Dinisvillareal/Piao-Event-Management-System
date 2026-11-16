<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\ActivityLog;
use App\Models\AgeBracket;
use App\Support\Paged;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MembershipController extends Controller
{
    // =========================
    // GET ALL (ACTIVE ONLY)
    // =========================
    public function index(Request $request)
    {
        // ✅ ONLY show active (not archived) memberships
        $query = Membership::withoutTrashed()
            ->where('is_active', true)
            ->with(['eligibleAgeBrackets', 'eligibleCivilStatus', 'eligibleCurrentStatus']);

        // paged=1 (Memberships screen): search, order and page are done here.
        if ($request->boolean('paged')) {
            // mine=<user id>: only the groups that resident belongs to (own id, or staff).
            if ($request->filled('mine')) {
                $mine = (int) $request->input('mine');
                if ($mine !== (int) auth()->id() && !$this->isStaff()) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
                $query->whereIn('id', DB::table('membership_residents')->where('user_id', $mine)->select('membership_id'));
            }
            foreach (Paged::tokens($request->input('search')) as $word) {
                $like = Paged::like($word);
                $query->where(fn ($q) => $q->whereRaw('LOWER(name) LIKE ?', [$like])->orWhereRaw("LOWER(COALESCE(description, '')) LIKE ?", [$like]));
            }
            $paginator = $query->orderBy('id')->paginate(Paged::perPage($request, 6), ['*'], 'page', Paged::page($request));

            return response()->json(Paged::body($paginator, $paginator->getCollection()->values(), [
                'all_total' => Membership::withoutTrashed()->where('is_active', true)->count(),
            ]));
        }

        $memberships = $query->get();
        // eligible_gender is a plain enum column (no relation to eager-load)
        
        return response()->json($memberships);
    }

    // =========================
    // CREATE MEMBERSHIP
    // =========================
    public function store(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'eligible_age_bracket_ids' => 'nullable|array|max:20',
            'eligible_age_bracket_ids.*' => 'integer|distinct|exists:age_brackets,id',
            'eligible_civil_status_id' => 'nullable|exists:civil_statuses,id',
            'eligible_current_status_id' => 'nullable|exists:current_statuses,id',
            'eligible_gender' => 'nullable|in:Male,Female',
        ]);

        DB::beginTransaction();

        try {
            $membership = Membership::create([
                'name' => $request->name,
                'description' => $request->description,
                'is_active' => true,  // ✅ Explicitly set active
                'eligible_civil_status_id' => $request->eligible_civil_status_id ?: null,
                'eligible_current_status_id' => $request->eligible_current_status_id ?: null,
                'eligible_gender' => $request->eligible_gender ?: null,
            ]);

            $membership->eligibleAgeBrackets()->sync($this->ageBracketIds($request));

            $this->createLog(
                'Create Membership',
                'Membership',
                "Created membership '{$membership->name}'"
            );

            DB::commit();
            return response()->json($membership->load('eligibleAgeBrackets'), 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to create membership',
                'error' => $this->safeError($e),
            ], 500);
        }
    }

    /**
     * Live "who would qualify?" check for the Add / Edit form. Applies the same
     * rule as checkMembershipEligibility(): the resident's age bracket must be
     * one of the selected brackets (nothing selected = any age), and every other
     * filter that is set must match too. Nothing is saved.
     *
     * Residents with no birth date can never match an age rule, so they are
     * counted separately (missing_birth_date) for staff to fix.
     */
    public function eligibilityPreview(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'eligible_age_bracket_ids' => 'nullable|array|max:20',
            'eligible_age_bracket_ids.*' => 'integer|exists:age_brackets,id',
            'eligible_civil_status_id' => 'nullable|integer',
            'eligible_current_status_id' => 'nullable|integer',
            'eligible_gender' => 'nullable|in:Male,Female',
            'membership_id' => 'nullable|integer',
        ]);

        $bracketIds = $this->ageBracketIds($request);
        $civil = $request->filled('eligible_civil_status_id') ? (int) $request->eligible_civil_status_id : null;
        $current = $request->filled('eligible_current_status_id') ? (int) $request->eligible_current_status_id : null;
        $gender = $request->input('eligible_gender') ?: null;

        $matches = function ($user) use ($bracketIds, $civil, $current, $gender): bool {
            if (!empty($bracketIds)) {
                $bracket = AgeBracket::resolveForAge($user->age);
                if (!$bracket || !in_array((int) $bracket->id, $bracketIds, true)) return false;
            }
            if ($civil && (int) $user->civil_status_id !== $civil) return false;
            if ($current && !$user->currentStatuses->contains('id', $current)) return false;
            if ($gender && $user->gender !== $gender) return false;
            return true;
        };

        $residents = \App\Models\User::where('role', 'Resident')
            ->with('currentStatuses:id')
            ->get(['id', 'birth_date', 'civil_status_id', 'gender']);

        $qualify = $residents->filter($matches)->count();
        $missingBirth = empty($bracketIds) ? 0 : $residents->whereNull('birth_date')->count();

        // Editing a live program: how many CURRENT members would stop matching.
        $wouldLose = 0;
        if ($request->filled('membership_id')) {
            $membership = Membership::withoutTrashed()->find((int) $request->membership_id);
            if ($membership) {
                $wouldLose = $membership->users()->with('currentStatuses:id')->get()
                    ->reject($matches)->count();
            }
        }

        return response()->json([
            'qualify' => $qualify,
            'total_residents' => $residents->count(),
            'missing_birth_date' => $missingBirth,
            'current_members_no_longer_match' => $wouldLose,
        ]);
    }

    /** De-duplicated bracket ids from the request (empty = any age). */
    private function ageBracketIds(Request $request): array
    {
        return collect($request->input('eligible_age_bracket_ids', []))
            ->filter()->map(fn ($v) => (int) $v)->unique()->values()->all();
    }

    // =========================
    // SHOW MEMBERSHIP
    // =========================
    public function show($id)
    {
        return response()->json(
            Membership::withoutTrashed()
                ->with(['eligibleAgeBrackets', 'eligibleCivilStatus', 'eligibleCurrentStatus'])
                ->findOrFail($id)
        );
    }

    // =========================
    // UPDATE MEMBERSHIP
    // =========================
    public function update(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'eligible_age_bracket_ids' => 'nullable|array|max:20',
            'eligible_age_bracket_ids.*' => 'integer|distinct|exists:age_brackets,id',
            'eligible_civil_status_id' => 'nullable|exists:civil_statuses,id',
            'eligible_current_status_id' => 'nullable|exists:current_statuses,id',
            'eligible_gender' => 'nullable|in:Male,Female',
        ]);

        DB::beginTransaction();

        try {
            // lockForUpdate: two staff saving the same membership at once are serialized, so the
            // age-bracket list is replaced by one save at a time (no mixed result).
            $membership = Membership::withoutTrashed()->lockForUpdate()->findOrFail($id);

            $membership->update([
                'name' => $request->name,
                'description' => $request->description,
                'eligible_civil_status_id' => $request->eligible_civil_status_id ?: null,
                'eligible_current_status_id' => $request->eligible_current_status_id ?: null,
                'eligible_gender' => $request->eligible_gender ?: null,
            ]);

            $membership->eligibleAgeBrackets()->sync($this->ageBracketIds($request));

            $this->createLog(
                'Update Membership',
                'Membership',
                "Updated membership '{$membership->name}'"
            );

            DB::commit();
            return response()->json($membership);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to update membership',
                'error' => $this->safeError($e),
            ], 500);
        }
    }

    // =========================
    // DELETE → NOW ARCHIVE
    // =========================
  public function destroy($id)
{
    if (!$this->isStaff()) {
        return response()->json(['message' => 'Unauthorized'], 403);
    }

    try {
        $membership = Membership::withoutTrashed()->findOrFail($id);
        $name = $membership->name;
        $residentCount = $membership->users()->count();
        
        if ($residentCount > 0) {
            $this->createLog(
                'Archive Membership Failed',
                'Membership',
                "Failed to archive membership '{$name}' - has {$residentCount} resident(s) assigned"
            );
            
            return response()->json([
                'message' => "Archive Failed: Membership is currently in use."
            ], 422);
        }
        
        DB::beginTransaction();
        
        // ✅ Pass the logged-in user's user_code
        $membership->archive(null, auth()->user()?->user_code);
        
        DB::commit();
        
        $this->createLog(
            'Archive Membership',
            'Membership',
            "Archived membership '{$name}'"
        );

        return response()->json([
            'message' => 'Membership archived successfully'
        ]);

    } catch (\Exception $e) {
        DB::rollBack();
        
        $this->createLog(
            'Archive Membership Error',
            'Membership',
            "Error archiving membership: " . $this->safeError($e)
        );
        
        return response()->json([
            'message' => 'Failed to archive membership: ' . $this->safeError($e)
        ], 500);
    }
}

    // ✅ NEW: Restore archived membership
    public function restore($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        DB::beginTransaction();

        try {
            $membership = Membership::onlyTrashed()->findOrFail($id);
            $name = $membership->name;
            
            $membership->unarchive();

            $this->createLog(
                'Restore Membership',
                'Membership',
                "Restored membership '{$name}'"
            );

            DB::commit();

            return response()->json([
                'message' => 'Membership restored successfully'
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to restore membership',
                'error' => $this->safeError($e),
            ], 500);
        }
    }

    // =========================
    // PAGINATION (ACTIVE ONLY)
    // =========================
    public function getPaginated(Request $request)
    {
        $perPage = $request->get('per_page', 15);
        
        // ✅ ONLY active memberships
        $memberships = Membership::withoutTrashed()
            ->where('is_active', true)
            ->paginate($perPage);
        
        return response()->json($memberships);
    }

    public function getSimplePaginated()
    {
        // ✅ ONLY active memberships
        return response()->json(
            Membership::withoutTrashed()
                ->where('is_active', true)
                ->simplePaginate(10)
        );
    }

    public function getCursorPaginated()
    {
        // ✅ ONLY active memberships
        return response()->json(
            Membership::withoutTrashed()
                ->where('is_active', true)
                ->cursorPaginate(10)
        );
    }

    public function searchPaginated(Request $request)
    {
        $search = $request->get('search');
        $perPage = $request->get('per_page', 10);

        // ✅ ONLY active memberships
        $memberships = Membership::withoutTrashed()
            ->where('is_active', true)
            ->when($search, function ($query, $search) {
                return $query->where('name', 'like', '%' . $search . '%')
                             ->orWhere('description', 'like', '%' . $search . '%');
            })
            ->paginate($perPage);

        return response()->json($memberships);
    }

    public function sortPaginated(Request $request)
    {
        $sortBy = $request->get('sort_by', 'id');
        $sortOrder = $request->get('sort_order', 'asc');
        $perPage = $request->get('per_page', 10);

        // ✅ ONLY active memberships
        return response()->json(
            Membership::withoutTrashed()
                ->where('is_active', true)
                ->orderBy($sortBy, $sortOrder)
                ->paginate($perPage)
        );
    }

    /**
     * Residents currently enrolled in this membership who no longer match
     * its eligibility rule (age bracket / civil status / current status /
     * gender). Eligibility is only checked when a resident is FIRST
     * assigned to a gated membership (see UserController::
     * checkMembershipEligibility) -- nothing re-checks it afterward, so a
     * resident who ages out of a bracket or whose status changes stays
     * enrolled indefinitely unless staff notice and remove them by hand.
     * This lets staff proactively find those cases instead of relying on
     * noticing by accident.
     */
    public function ineligibleMembers($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $membership = Membership::withoutTrashed()->findOrFail($id);

        $requiredBracketIds = $membership->eligibleAgeBracketIds();

        if (empty($requiredBracketIds)
            && !$membership->eligible_civil_status_id
            && !$membership->eligible_current_status_id
            && !$membership->eligible_gender) {
            return response()->json(['ineligible' => []]);
        }

        $members = $membership->users()->with('currentStatuses')->get();

        $ineligible = [];

        foreach ($members as $user) {
            $reasons = [];

            if (!empty($requiredBracketIds)) {
                $bracket = AgeBracket::resolveForAge($user->age);
                if (!$bracket || !in_array((int) $bracket->id, $requiredBracketIds, true)) {
                    $reasons[] = 'no longer in the required age group';
                }
            }

            if ($membership->eligible_civil_status_id
                && (int) $user->civil_status_id !== (int) $membership->eligible_civil_status_id) {
                $reasons[] = 'civil status no longer matches';
            }

            if ($membership->eligible_current_status_id) {
                $currentStatusIds = $user->getRelationValue('currentStatuses')->pluck('id')->map(fn ($v) => (int) $v)->all();
                if (!in_array((int) $membership->eligible_current_status_id, $currentStatusIds, true)) {
                    $reasons[] = 'current status no longer matches';
                }
            }

            if ($membership->eligible_gender && $user->gender !== $membership->eligible_gender) {
                $reasons[] = 'gender no longer matches';
            }

            if (!empty($reasons)) {
                $ineligible[] = [
                    'id' => $user->id,
                    'name' => trim("{$user->first_name} {$user->last_name}"),
                    'user_code' => $user->user_code,
                    'reasons' => $reasons,
                ];
            }
        }

        return response()->json(['ineligible' => $ineligible]);
    }
}
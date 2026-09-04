<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\MembershipResident;

class MembershipResidentController extends Controller
{
    // =========================
    // AUTH HELPERS
    // =========================

    private function isStaff()
    {
        $user = auth()->user();
        return $user && $user->role === 'Staff';
    }

    private function isOwnProfile($id)
    {
        return auth()->id() == $id;
    }

    // =========================
    // GET ALL USERS + MEMBERSHIPS (INCLUDING SOFT DELETED)
    // =========================

public function index()
{
   $users = User::with('memberships', 'household', 'currentStatuses')->get();

    return response()->json(
        $users->map(function ($user) {

            return [
                'user_id' => $user->id,
                'id' => $user->id,
                'user_code' => $user->user_code,
                'first_name' => $user->first_name,
                'middle_name' => $user->middle_name,
                'last_name' => $user->last_name,
                'contact_number' => $user->contact_number,
                'role' => $user->role,
                'has_account' => $user->has_account,

                // ✅ ONLY THIS — real soft delete column from your DB
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
        })
    );
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





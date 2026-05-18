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
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can view all memberships'
            ], 403);
        }

        $users = DB::table('users')
            // 🔥 NO whereNull(deleted_at) → includes deleted + active users
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
                'users.deleted_at', // 🔥 show soft delete status

                'memberships.id as membership_id',
                'memberships.name as membership_name'
            )
            ->get()
            ->groupBy('id')
            ->map(function ($items) {

                $first = $items->first();

                return [
                    'user_id' => $first->id,
                    'user_code' => $first->user_code,
                    'first_name' => $first->first_name,
                    'middle_name' => $first->middle_name,
                    'last_name' => $first->last_name,
                    'contact_number' => $first->contact_number,
                    'has_account' => $first->has_account,

                    // 🔥 soft delete flag
                    'is_deleted' => $first->deleted_at ? true : false,

                    'memberships' => $items
                        ->filter(fn ($i) => $i->membership_id)
                        ->map(fn ($i) => [
                            'id' => $i->membership_id,
                            'name' => $i->membership_name,
                        ])
                        ->values()
                ];
            })
            ->values();

        return response()->json($users);
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
            'is_deleted' => $user->deleted_at ? true : false,

            'memberships' => $memberships->items(),
            'current_page' => $memberships->currentPage(),
            'last_page' => $memberships->lastPage(),
            'total' => $memberships->total(),
            'per_page' => $memberships->perPage(),
        ]);
    }
}

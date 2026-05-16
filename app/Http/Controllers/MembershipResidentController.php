<?php

namespace App\Http\Controllers;

use App\Models\User; 
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\MembershipResident;

class MembershipResidentController extends Controller
{
    // Helper methods for authorization
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
    // GET ALL (GROUPED BY USER)
    // =========================
    public function index()
    {
        // ✅ Only Staff can view all users' memberships
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can view all memberships'
            ], 403);
        }

        $data = DB::table('membership_residents')
            ->leftJoin('users', 'membership_residents.user_id', '=', 'users.id')
            ->leftJoin('memberships', 'membership_residents.membership_id', '=', 'memberships.id')
            ->select(
                'users.id',
                'users.user_code',
                'users.first_name',
                'users.middle_name',
                'users.last_name',
                'memberships.id as membership_id',
                'memberships.name as membership_name'
            )
            ->get()
            ->groupBy('user_code')
            ->map(function ($items) {

                $first = $items->first();

                return [
                    'user_code' => $first->user_code,
                    'first_name' => $first->first_name,
                    'middle_name' => $first->middle_name,
                    'last_name' => $first->last_name,
                    'memberships' => $items->map(function ($item) {
                        return [
                            'id' => $item->membership_id,
                            'name' => $item->membership_name,
                        ];
                    })->values()
                ];
            })
            ->values();

        return response()->json($data);
    }

    // =========================
    // SHOW SINGLE RESIDENT
    // =========================
    public function show($id)
    {
        // ✅ Residents can view only their own, Staff can view any
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: You can only view your own memberships'
            ], 403);
        }

        $data = DB::table('membership_residents')
            ->leftJoin('users', 'membership_residents.user_id', '=', 'users.id')
            ->leftJoin('memberships', 'membership_residents.membership_id', '=', 'memberships.id')
            ->select(
                'users.id',
                'users.user_code',
                'users.first_name',
                'users.middle_name',
                'users.last_name',
                'memberships.id as membership_id',
                'memberships.name as membership_name'
            )
            ->where('users.id', $id)
            ->get();

        if ($data->isEmpty()) {
            return response()->json([
                'message' => 'Resident not found'
            ], 404);
        }

        $first = $data->first();

        return response()->json([
            'user_code' => $first->user_code,
            'first_name' => $first->first_name,
            'middle_name' => $first->middle_name,
            'last_name' => $first->last_name,
            'memberships' => $data->map(function ($item) {
                return [
                    'id' => $item->membership_id,
                    'name' => $item->membership_name,
                ];
            })->values()
        ]);
    }

    // =========================
    // ASSIGN MEMBERSHIPS
    // =========================
    public function store(Request $request)
    {
        // ✅ Only Staff can assign memberships
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can assign memberships'
            ], 403);
        }

        $request->validate([
            'user_id' => 'required|exists:users,id',
            'membership_ids' => 'required|array|min:1',
            'membership_ids.*' => 'required|exists:memberships,id',
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
        // ✅ Only Staff can update memberships
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can update memberships'
            ], 403);
        }

        $request->validate([
            'membership_ids' => 'required|array|min:1',
            'membership_ids.*' => 'required|exists:memberships,id',
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
        // ✅ Only Staff can delete memberships
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can delete memberships'
            ], 403);
        }

        MembershipResident::where('user_id', $id)->delete();

        return response()->json([
            'message' => 'Memberships deleted successfully'
        ]);
    }

    // =========================
    // GET USER MEMBERSHIPS WITH PAGINATION
    // =========================
    public function getUserMembershipsPaginated($id, Request $request)
    {
        // ✅ Residents can view only their own, Staff can view any
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: You can only view your own memberships'
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
            $query->where('memberships.name', 'like', '%' . $search . '%');
        }
        
        $memberships = $query->paginate($perPage);
        
        return response()->json([
            'user_code' => $user->user_code,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'memberships' => $memberships->items(),
            'current_page' => $memberships->currentPage(),
            'last_page' => $memberships->lastPage(),
            'total' => $memberships->total(),
            'per_page' => $memberships->perPage(),
        ]);
    }
}
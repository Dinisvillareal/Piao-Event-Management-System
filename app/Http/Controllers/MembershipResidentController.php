<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\MembershipResident;

class MembershipResidentController extends Controller
{
    // =========================
    // GET ALL (GROUPED BY USER)
    // =========================
    public function index()
    {
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
                    'user_code' => $first->user_code, // 🔥 PR-000001 instead of id

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
        MembershipResident::where('user_id', $id)->delete();

        return response()->json([
            'message' => 'Memberships deleted successfully'
        ]);
    }
}

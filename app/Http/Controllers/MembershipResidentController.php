<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\MembershipResident;

class MembershipResidentController extends Controller
{
    public function index()
    {
        $data = DB::table('membership_residents')
            ->leftJoin('users', 'membership_residents.user_id', '=', 'users.id')
            ->leftJoin('memberships', 'membership_residents.membership_id', '=', 'memberships.id')
            ->select(
                'users.id as user_id',
                'users.first_name',
                'users.middle_name',
                'users.last_name',
                'memberships.id as membership_id',
                'memberships.name as membership_name'
            )
            ->get()
            ->groupBy('user_id')
            ->map(function ($items) {

                $first = $items->first();

                return [

                    'user_id' => $first->user_id,

                    'first_name' => $first->first_name,
                    'middle_name' => $first->middle_name,
                    'last_name' => $first->last_name,

                    // 🔥 NESTED MEMBERSHIPS
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

    public function show($id)
    {
        $data = DB::table('membership_residents')
            ->leftJoin('users', 'membership_residents.user_id', '=', 'users.id')
            ->leftJoin('memberships', 'membership_residents.membership_id', '=', 'memberships.id')
            ->select(
                'users.id as user_id',
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

            'user_id' => $first->user_id,

            'first_name' => $first->first_name,
            'middle_name' => $first->middle_name,
            'last_name' => $first->last_name,

            // 🔥 NESTED MEMBERSHIPS
            'memberships' => $data->map(function ($item) {

                return [
                    'id' => $item->membership_id,
                    'name' => $item->membership_name,
                ];

            })->values()

        ]);
    }

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

    public function update(Request $request, $id)
    {
        $request->validate([

            'membership_ids' => 'required|array|min:1',

            'membership_ids.*' => 'required|exists:memberships,id',
        ]);

        // ❌ DELETE OLD MEMBERSHIPS
        MembershipResident::where('user_id', $id)->delete();

        // ✅ INSERT NEW MEMBERSHIPS
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

    public function destroy($id)
    {
        MembershipResident::where('user_id', $id)->delete();

        return response()->json([
            'message' => 'Memberships deleted successfully'
        ]);
    }
}

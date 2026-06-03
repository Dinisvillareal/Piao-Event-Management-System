<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MembershipController extends Controller
{
    // =========================
    // HELPERS
    // =========================

    private function createLog($action, $module, $description)
    {
        ActivityLog::create([
            'user_code'   => auth()->user()?->user_code ?? 'SYSTEM',
            'action'      => $action,
            'module'      => $module,
            'description' => $description,
        ]);
    }

    // =========================
    // GET ALL
    // =========================

    public function index()
    {
        return response()->json(Membership::all());
    }

    // =========================
    // CREATE MEMBERSHIP
    // =========================

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string'
        ]);

        DB::beginTransaction();

        try {

            $membership = Membership::create([
                'name' => $request->name,
                'description' => $request->description
            ]);

            $this->createLog(
                'Create Membership',
                'Membership',
                "Created membership '{$membership->name}'"
            );

            DB::commit();

            return response()->json($membership, 201);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to create membership',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // =========================
    // SHOW MEMBERSHIP
    // =========================

    public function show($id)
    {
        return response()->json(Membership::findOrFail($id));
    }

    // =========================
    // UPDATE MEMBERSHIP
    // =========================

    public function update(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string'
        ]);

        DB::beginTransaction();

        try {

            $membership = Membership::findOrFail($id);

            $membership->update([
                'name' => $request->name,
                'description' => $request->description
            ]);

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
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // =========================
    // DELETE MEMBERSHIP
    // =========================

    public function destroy($id)
    {
        DB::beginTransaction();

        try {

            $membership = Membership::findOrFail($id);

            $name = $membership->name;

            $membership->delete();

            $this->createLog(
                'Delete Membership',
                'Membership',
                "Deleted membership '{$name}'"
            );

            DB::commit();

            return response()->json([
                'message' => 'Membership deleted successfully'
            ]);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to delete membership',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // =========================
    // PAGINATION METHODS
    // =========================

    public function getPaginated(Request $request)
    {
        $perPage = $request->get('per_page', 15);
        return response()->json(Membership::paginate($perPage));
    }

    public function getSimplePaginated()
    {
        return response()->json(Membership::simplePaginate(10));
    }

    public function getCursorPaginated()
    {
        return response()->json(Membership::cursorPaginate(10));
    }

    public function searchPaginated(Request $request)
    {
        $search = $request->get('search');
        $perPage = $request->get('per_page', 10);

        $memberships = Membership::when($search, function ($query, $search) {
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

        return response()->json(
            Membership::orderBy($sortBy, $sortOrder)->paginate($perPage)
        );
    }
}

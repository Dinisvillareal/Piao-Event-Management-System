<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MembershipController extends Controller
{
    private function isStaff()
    {
        return auth()->user()?->role === 'Staff';
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

    // =========================
    // GET ALL (ACTIVE ONLY)
    // =========================
    public function index()
    {
        // ✅ ONLY show active (not archived) memberships
        $memberships = Membership::withoutTrashed()
            ->where('is_active', true)
            ->get();
        
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
            'description' => 'nullable|string'
        ]);

        DB::beginTransaction();

        try {
            $membership = Membership::create([
                'name' => $request->name,
                'description' => $request->description,
                'is_active' => true,  // ✅ Explicitly set active
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
        return response()->json(Membership::withoutTrashed()->findOrFail($id));
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
            'description' => 'nullable|string'
        ]);

        DB::beginTransaction();

        try {
            $membership = Membership::withoutTrashed()->findOrFail($id);

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
            "Error archiving membership: " . $e->getMessage()
        );
        
        return response()->json([
            'message' => 'Failed to archive membership: ' . $e->getMessage()
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
                'error' => $e->getMessage()
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
}
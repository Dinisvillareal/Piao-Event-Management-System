<?php

namespace App\Http\Controllers;

use App\Models\CivilStatus;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class CivilStatusController extends Controller
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

    public function index()
    {
        return response()->json(CivilStatus::orderBy('sort_order')->get());
    }

    public function store(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'label'      => 'required|string|max:50',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $status = CivilStatus::create([
            'label'      => $request->label,
            'sort_order' => $request->sort_order ?? ((int) CivilStatus::max('sort_order') + 1),
        ]);

        CivilStatus::forgetCache();
        $this->createLog('Create Civil Status', 'Profiling Settings', "Created civil status '{$status->label}'");

        return response()->json($status, 201);
    }

    public function update(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $status = CivilStatus::findOrFail($id);

        $request->validate([
            'label'      => 'required|string|max:50',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $status->update([
            'label'      => $request->label,
            'sort_order' => $request->sort_order ?? $status->sort_order,
        ]);

        CivilStatus::forgetCache();
        $this->createLog('Update Civil Status', 'Profiling Settings', "Updated civil status '{$status->label}'");

        return response()->json($status);
    }

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $status = CivilStatus::findOrFail($id);
        $name = $status->label;
        // Record who archived it before soft-deleting -- otherwise the
        // Archive page has nothing to show but "SYSTEM".
        $status->deleted_by = auth()->user()->user_code;
        $status->save();
        $status->delete();

        CivilStatus::forgetCache();
        $this->createLog('Delete Civil Status', 'Profiling Settings', "Deleted civil status '{$name}'");

        return response()->json(['message' => 'Civil status deleted successfully']);
    }

    public function restore($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $status = CivilStatus::onlyTrashed()->findOrFail($id);
        $status->deleted_by = null;
        $status->restore();

        CivilStatus::forgetCache();
        $this->createLog('Restore Civil Status', 'Profiling Settings', "Restored civil status '{$status->label}'");

        return response()->json(['message' => 'Civil status restored successfully']);
    }
}

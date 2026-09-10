<?php

namespace App\Http\Controllers;

use App\Models\CurrentStatus;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class CurrentStatusController extends Controller
{
    public function index()
    {
        return response()->json(CurrentStatus::orderBy('sort_order')->get());
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

        $status = CurrentStatus::create([
            'label'      => $request->label,
            'sort_order' => $request->sort_order ?? ((int) CurrentStatus::max('sort_order') + 1),
        ]);

        CurrentStatus::forgetCache();
        $this->createLog('Create Current Status', 'Profiling Settings', "Created current status '{$status->label}'");

        return response()->json($status, 201);
    }

    public function update(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $status = CurrentStatus::findOrFail($id);

        $request->validate([
            'label'      => 'required|string|max:50',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $status->update([
            'label'      => $request->label,
            'sort_order' => $request->sort_order ?? $status->sort_order,
        ]);

        CurrentStatus::forgetCache();
        $this->createLog('Update Current Status', 'Profiling Settings', "Updated current status '{$status->label}'");

        return response()->json($status);
    }

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $status = CurrentStatus::findOrFail($id);
        $name = $status->label;
        // Record who archived it before soft-deleting -- otherwise the
        // Archive page has nothing to show but "SYSTEM".
        $status->deleted_by = auth()->user()->user_code;
        $status->save();
        $status->delete();

        CurrentStatus::forgetCache();
        $this->createLog('Delete Current Status', 'Profiling Settings', "Deleted current status '{$name}'");

        return response()->json(['message' => 'Current status deleted successfully']);
    }

    public function restore($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $status = CurrentStatus::onlyTrashed()->findOrFail($id);
        $status->deleted_by = null;
        $status->restore();

        CurrentStatus::forgetCache();
        $this->createLog('Restore Current Status', 'Profiling Settings', "Restored current status '{$status->label}'");

        return response()->json(['message' => 'Current status restored successfully']);
    }
}

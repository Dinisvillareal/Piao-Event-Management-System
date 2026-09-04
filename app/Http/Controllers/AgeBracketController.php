<?php

namespace App\Http\Controllers;

use App\Models\AgeBracket;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class AgeBracketController extends Controller
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
        return response()->json(AgeBracket::orderBy('sort_order')->orderBy('min_age')->get());
    }

    public function store(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'label'      => 'required|string|max:50',
            'min_age'    => 'required|integer|min:0|max:150',
            'max_age'    => 'nullable|integer|min:0|max:150|gte:min_age',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $bracket = AgeBracket::create([
            'label'      => $request->label,
            'min_age'    => $request->min_age,
            'max_age'    => $request->max_age,
            'sort_order' => $request->sort_order ?? ((int) AgeBracket::max('sort_order') + 1),
        ]);

        AgeBracket::forgetCache();
        $this->createLog('Create Age Bracket', 'Profiling Settings', "Created age bracket '{$bracket->label}'");

        return response()->json($bracket, 201);
    }

    public function update(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $bracket = AgeBracket::findOrFail($id);

        $request->validate([
            'label'      => 'required|string|max:50',
            'min_age'    => 'required|integer|min:0|max:150',
            'max_age'    => 'nullable|integer|min:0|max:150|gte:min_age',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $bracket->update([
            'label'      => $request->label,
            'min_age'    => $request->min_age,
            'max_age'    => $request->max_age,
            'sort_order' => $request->sort_order ?? $bracket->sort_order,
        ]);

        AgeBracket::forgetCache();
        $this->createLog('Update Age Bracket', 'Profiling Settings', "Updated age bracket '{$bracket->label}'");

        return response()->json($bracket);
    }

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $bracket = AgeBracket::findOrFail($id);
        $name = $bracket->label;
        // Record who archived it before soft-deleting -- otherwise the
        // Archive page has nothing to show but "SYSTEM".
        $bracket->deleted_by = auth()->user()->user_code;
        $bracket->save();
        $bracket->delete();

        AgeBracket::forgetCache();
        $this->createLog('Delete Age Bracket', 'Profiling Settings', "Deleted age bracket '{$name}'");

        return response()->json(['message' => 'Age bracket deleted successfully']);
    }

    public function restore($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $bracket = AgeBracket::onlyTrashed()->findOrFail($id);
        $bracket->deleted_by = null;
        $bracket->restore();

        AgeBracket::forgetCache();
        $this->createLog('Restore Age Bracket', 'Profiling Settings', "Restored age bracket '{$bracket->label}'");

        return response()->json(['message' => 'Age bracket restored successfully']);
    }
}

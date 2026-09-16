<?php

namespace App\Http\Controllers;

use App\Models\AgeBracket;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class AgeBracketController extends Controller
{
    public function index()
    {
        return response()->json(AgeBracket::orderBy('sort_order')->orderBy('min_age')->get());
    }

    /**
     * Finds an existing bracket whose [min_age, max_age] range overlaps
     * the given range, so Staff can't accidentally define two brackets
     * that both claim the same ages (e.g. adding "Teens" 12-18 while
     * "Youth" 13-17 already exists). A null max_age means "no upper
     * limit" on either side. $excludeId skips the bracket being edited
     * so saving it unchanged (or just renaming it) never conflicts with
     * itself.
     */
    private function findOverlappingBracket(int $minAge, ?int $maxAge, ?int $excludeId = null): ?AgeBracket
    {
        $incomingMax = $maxAge ?? PHP_INT_MAX;

        $query = AgeBracket::query();
        if ($excludeId !== null) {
            $query->where('id', '!=', $excludeId);
        }

        foreach ($query->get() as $bracket) {
            $existingMax = $bracket->max_age ?? PHP_INT_MAX;
            if ($minAge <= $existingMax && $bracket->min_age <= $incomingMax) {
                return $bracket;
            }
        }

        return null;
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

        $conflict = $this->findOverlappingBracket($request->min_age, $request->max_age);
        if ($conflict) {
            $conflictRange = $conflict->min_age . '-' . ($conflict->max_age ?? '∞');
            return response()->json([
                'errors' => ['min_age' => ["This age range overlaps with \"{$conflict->label}\" ({$conflictRange}). Adjust the range so it doesn't overlap an existing bracket."]],
            ], 422);
        }

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

        $conflict = $this->findOverlappingBracket($request->min_age, $request->max_age, $bracket->id);
        if ($conflict) {
            $conflictRange = $conflict->min_age . '-' . ($conflict->max_age ?? '∞');
            return response()->json([
                'errors' => ['min_age' => ["This age range overlaps with \"{$conflict->label}\" ({$conflictRange}). Adjust the range so it doesn't overlap an existing bracket."]],
            ], 422);
        }

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

        // Guard against silently breaking a membership's eligibility rule
        // -- mirrors Membership::hasResidentsAssigned() / InventoryController's
        // own "still in use" checks.
        if ($bracket->memberships()->exists()) {
            return response()->json([
                'message' => "Archive Failed: \"{$bracket->label}\" is currently in use by a membership's eligibility rule.",
            ], 422);
        }

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

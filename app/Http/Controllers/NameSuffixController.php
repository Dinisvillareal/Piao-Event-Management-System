<?php

namespace App\Http\Controllers;

use App\Models\NameSuffix;
use Illuminate\Http\Request;

/**
 * The list of name suffixes (Jr., Sr., II ...) offered in the resident forms.
 * Anyone signed in can read it; only staff can add or remove entries.
 * Removing an entry only trims the dropdown -- residents already saved with
 * that suffix keep it (users.suffix is a plain string, not a foreign key).
 */
class NameSuffixController extends Controller
{
    public function index()
    {
        return response()->json(
            NameSuffix::orderBy('name')->orderBy('id')->get(['id', 'name'])
        );
    }

    public function store(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'name' => 'required|string|max:10',
        ]);

        $name = trim($request->name);
        if ($name === '') {
            return response()->json(['errors' => ['name' => ['Suffix cannot be empty.']], 'message' => 'Suffix cannot be empty.'], 422);
        }

        if (NameSuffix::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists()) {
            return response()->json([
                'errors' => ['name' => ["\"{$name}\" is already in the list."]],
                'message' => "\"{$name}\" is already in the list.",
            ], 422);
        }

        $suffix = NameSuffix::create([
            'name' => $name,
            'sort_order' => (int) NameSuffix::max('sort_order') + 1,
        ]);

        $this->createLog('Create Suffix', 'User', "Added name suffix '{$suffix->name}'");

        return response()->json(['id' => $suffix->id, 'name' => $suffix->name], 201);
    }

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $suffix = NameSuffix::findOrFail($id);
        $name = $suffix->name;
        $suffix->delete();

        $this->createLog('Delete Suffix', 'User', "Removed name suffix '{$name}' from the list");

        return response()->json(['message' => 'Suffix removed.']);
    }
}

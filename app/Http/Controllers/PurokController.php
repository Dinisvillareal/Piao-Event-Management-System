<?php

namespace App\Http\Controllers;

use App\Models\Purok;
use Illuminate\Http\Request;

class PurokController extends Controller
{
    public function index()
    {
        return response()->json(
            Purok::orderByRaw('LENGTH(name), name')->get(['id', 'name'])
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50', 'unique:puroks,name'],
        ]);

        $purok = Purok::create(['name' => trim($validated['name'])]);

        return response()->json($purok->only(['id', 'name']), 201);
    }

    public function destroy(Purok $purok)
    {
        $purok->delete();

        return response()->json(['deleted' => true]);
    }
}
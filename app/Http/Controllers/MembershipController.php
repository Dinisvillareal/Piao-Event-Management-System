<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use Illuminate\Http\Request;

class MembershipController extends Controller
{
    public function index()
    {
        $memberships = Membership::all();
        return response()->json($memberships);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string'
        ]);

        $membership = Membership::create([
            'name' => $request->name,
            'description' => $request->description
        ]);

        return response()->json($membership, 201);
    }

    public function show($id)
    {
        $membership = Membership::findOrFail($id);
        return response()->json($membership);
    }

    public function update(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string'
        ]);

        $membership = Membership::findOrFail($id);
        $membership->update([
            'name' => $request->name,
            'description' => $request->description
        ]);

        return response()->json($membership);
    }

    public function destroy($id)
    {
        $membership = Membership::findOrFail($id);
        $membership->delete();

        return response()->json(['message' => 'Membership deleted successfully']);
    }

    public function getPaginated(Request $request)
    {
        $perPage = $request->get('per_page', 15);
        $memberships = Membership::paginate($perPage);
        return response()->json($memberships);
    }

    public function getSimplePaginated()
    {
        $memberships = Membership::simplePaginate(10);
        return response()->json($memberships);
    }

    public function getCursorPaginated()
    {
        $memberships = Membership::cursorPaginate(10);
        return response()->json($memberships);
    }

    public function searchPaginated(Request $request)
    {
        $search = $request->get('search');
        $perPage = $request->get('per_page', 10);
        
        $memberships = Membership::when($search, function($query, $search) {
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
        
        $memberships = Membership::orderBy($sortBy, $sortOrder)
            ->paginate($perPage);
        
        return response()->json($memberships);
    }
}
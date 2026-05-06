<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use Illuminate\Http\Request;

class MembershipController extends Controller
{
    /**
     * Display a paginated listing of memberships.
     */
    public function index()
    {
        // Paginate with 10 items per page
        $memberships = Membership::paginate(10);
        
        // For API response
        return response()->json($memberships);
        
        // For view response (uncomment if using views)
        // return view('memberships.index', compact('memberships'));
    }

    /**
     * Show form to create new membership.
     */
    public function create()
    {
        return view('memberships.create');
    }

    /**
     * Store a newly created membership.
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255'
        ]);

        $membership = Membership::create([
            'name' => $request->name
        ]);

        return response()->json($membership, 201);
    }

    /**
     * Display the specified membership.
     */
    public function show($id)
    {
        $membership = Membership::findOrFail($id);
        return response()->json($membership);
    }

    /**
     * Show form to edit membership.
     */
    public function edit($id)
    {
        $membership = Membership::findOrFail($id);
        return view('memberships.edit', compact('membership'));
    }

    /**
     * Update the specified membership.
     */
    public function update(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255'
        ]);

        $membership = Membership::findOrFail($id);
        $membership->update([
            'name' => $request->name
        ]);

        return response()->json($membership);
    }

    /**
     * Remove the specified membership.
     */
    public function destroy($id)
    {
        $membership = Membership::findOrFail($id);
        $membership->delete();

        return response()->json(['message' => 'Membership deleted successfully']);
    }

    /**
     * Additional pagination examples
     */
    
    // Get paginated with custom page size
    public function getPaginated(Request $request)
    {
        $perPage = $request->get('per_page', 15); // Default 15 items
        $memberships = Membership::paginate($perPage);
        
        return response()->json($memberships);
    }

    // Get simple pagination (previous/next only, no page numbers)
    public function getSimplePaginated()
    {
        $memberships = Membership::simplePaginate(10);
        return response()->json($memberships);
    }

    // Get paginated with cursor (for large datasets)
    public function getCursorPaginated()
    {
        $memberships = Membership::cursorPaginate(10);
        return response()->json($memberships);
    }

    // Get paginated with search
    public function searchPaginated(Request $request)
    {
        $search = $request->get('search');
        $perPage = $request->get('per_page', 10);
        
        $memberships = Membership::when($search, function($query, $search) {
                return $query->where('name', 'like', '%' . $search . '%');
            })
            ->paginate($perPage);
        
        return response()->json($memberships);
    }

    // Get paginated with sorting
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
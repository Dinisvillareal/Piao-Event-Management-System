<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    private function isStaff()
    {
        return auth()->user()?->role === 'Staff';
    }

    private function createLog($action, $description)
    {
        ActivityLog::create([
            'user_code' => auth()->user()?->user_code ?? 'SYSTEM',
            'action' => $action,
            'module' => 'Inventory',
            'description' => $description,
        ]);
    }

    // UC-9: Manage Barangay Inventory
    public function index(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = InventoryItem::query();

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                  ->orWhere('storage_location', 'like', "%$search%");
            });
        }

        if ($request->filled('condition')) {
            $query->where('condition', $request->condition);
        }

        return response()->json($query->orderBy('name')->get());
    }

    public function store(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'name' => 'required|string|max:150',
            'quantity' => 'required|integer|min:0',
            'condition' => 'required|in:New,Good,Fair,Poor,Disposed,Lost',
            'storage_location' => 'nullable|string|max:150',
            'notes' => 'nullable|string|max:255',
        ]);

        $item = InventoryItem::create($request->only(['name', 'quantity', 'condition', 'storage_location', 'notes']));
        $this->createLog('Create', "Added inventory item: {$item->name}");

        return response()->json(['message' => 'Item added', 'item' => $item], 201);
    }

    public function update(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'name' => 'sometimes|string|max:150',
            'quantity' => 'sometimes|integer|min:0',
            'condition' => 'sometimes|in:New,Good,Fair,Poor,Disposed,Lost',
            'storage_location' => 'nullable|string|max:150',
            'notes' => 'nullable|string|max:255',
        ]);

        $item = InventoryItem::findOrFail($id);
        $item->update($request->only(['name', 'quantity', 'condition', 'storage_location', 'notes']));
        $this->createLog('Update', "Updated inventory item: {$item->name}");

        return response()->json(['message' => 'Item updated', 'item' => $item]);
    }

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = InventoryItem::findOrFail($id);
        $item->deleted_by = auth()->user()->user_code;
        $item->save();
        $item->delete();
        $this->createLog('Delete', "Removed inventory item: {$item->name}");

        return response()->json(['message' => 'Item removed']);
    }
}

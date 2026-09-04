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

        // borrowed_quantity: how many units are currently lent out to a
        // still-active event (see InventoryItem::borrows()) -- the grid
        // uses this to grey out Delete on an item that's out on loan.
        $items = $query->withSum('borrows as borrowed_quantity', 'quantity')
            ->orderBy('name')
            ->get();

        $items->each(function ($item) {
            $item->borrowed_quantity = (int) ($item->borrowed_quantity ?? 0);
        });

        return response()->json($items);
    }

    // Items selectable when borrowing inventory for an Event (Create/Edit
    // Event form) -- Disposed and Lost stock is excluded since it can't
    // actually be lent out, unlike the full Inventory grid which still
    // lists it for record-keeping.
    public function borrowable(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $items = InventoryItem::whereNotIn('condition', ['Disposed', 'Lost'])
            ->orderBy('name')
            ->get(['id', 'name', 'quantity', 'condition', 'storage_location']);

        return response()->json($items);
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

        // Block deleting an item that's currently lent out to a live event.
        // InventoryItem only soft-deletes, so nothing here would actually
        // cascade-remove the outstanding event_inventory_items row -- the
        // event would keep pointing at a "deleted" item, and returning it
        // later (event archived/edited) would silently add its quantity
        // back onto a record no one can see or manage anymore. Staff need
        // to return the item to Inventory first (edit or archive the
        // event) before it can be removed.
        if ($item->borrows()->exists()) {
            return response()->json([
                'message' => '"' . $item->name . '" is currently borrowed for an event and can\'t be deleted until it\'s returned to Inventory.',
            ], 409);
        }

        $item->deleted_by = auth()->user()->user_code;
        $item->save();
        $item->delete();
        $this->createLog('Delete', "Removed inventory item: {$item->name}");

        return response()->json(['message' => 'Item removed']);
    }
}

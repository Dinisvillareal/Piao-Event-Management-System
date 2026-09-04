<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use App\Http\Requests\StoreInventoryItemRequest;
use App\Http\Requests\UpdateInventoryItemRequest;

class InventoryController extends Controller
{
    protected $logModule = 'Inventory';

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
        // borrows.event is also loaded so we can flag a borrow whose event
        // has already ended -- staff have no other way to notice an item
        // is stuck on loan to a past event nobody archived yet.
        $items = $query->withSum('borrows as borrowed_quantity', 'quantity')
            ->with(['borrows.event:id,name,event_start,event_end'])
            ->orderBy('name')
            ->get();

        $items->each(function ($item) {
            $item->borrowed_quantity = (int) ($item->borrowed_quantity ?? 0);

            // The earliest-ended event still holding this item, if any --
            // "ended" means event_end (or event_start when no end is set)
            // is in the past. Only set when the item is actually overdue,
            // so the frontend can tell a normal current loan apart from a
            // stale one that needs someone to go archive that event.
            $overdue = $item->borrows
                ->filter(fn ($b) => $b->event)
                ->map(fn ($b) => $b->event)
                ->filter(fn ($event) => ($event->event_end ?? $event->event_start) < now())
                ->sortBy(fn ($event) => $event->event_end ?? $event->event_start)
                ->first();

            $item->overdue_borrow_event = $overdue ? [
                'id' => $overdue->id,
                'name' => $overdue->name,
                'ended_at' => $overdue->event_end ?? $overdue->event_start,
            ] : null;

            unset($item->borrows);
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

    public function store(StoreInventoryItemRequest $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = InventoryItem::create($request->only(['name', 'quantity', 'condition', 'storage_location', 'notes']));
        $this->createLog('Create', "Added inventory item: {$item->name}");

        return response()->json(['message' => 'Item added', 'item' => $item], 201);
    }

    public function update(UpdateInventoryItemRequest $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = InventoryItem::findOrFail($id);

        // Marking an item Disposed/Lost archives it (see below), so -- same
        // as manual Delete -- block that while it's still on loan to a live
        // event. Staff need to close out the loan first (return it, or
        // archive/edit that event) before the item can be retired; checking
        // the *requested* condition here means the item's other fields
        // (name/quantity/storage/notes) are never silently half-saved
        // before the guard kicks in.
        $requestedCondition = $request->input('condition', $item->condition);
        if (in_array($requestedCondition, ['Disposed', 'Lost'], true) && $item->borrows()->exists()) {
            return response()->json([
                'message' => '"' . $item->name . '" is currently borrowed for an event and can\'t be marked ' . $requestedCondition . ' until it\'s returned to Inventory.',
            ], 409);
        }

        $item->update($request->only(['name', 'quantity', 'condition', 'storage_location', 'notes']));
        $this->createLog('Update', "Updated inventory item: {$item->name}");

        // Disposed/Lost means this item is retired from active inventory --
        // archive it the same way manual Delete does (soft-delete +
        // deleted_by) instead of leaving a "Disposed"/"Lost" row sitting in
        // the active grid, still counted as available stock and still
        // selectable when borrowing for a future event. The guard above
        // already guarantees there's no outstanding loan by the time we
        // get here.
        if (in_array($item->condition, ['Disposed', 'Lost'], true)) {
            $item->deleted_by = auth()->user()->user_code;
            $item->save();
            $item->delete();
            $this->createLog('Archive', "Archived inventory item: {$item->name} (condition: {$item->condition})");

            return response()->json([
                'message' => 'Item marked ' . $item->condition . ' and archived.',
                'item' => $item,
                'archived' => true,
            ]);
        }

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

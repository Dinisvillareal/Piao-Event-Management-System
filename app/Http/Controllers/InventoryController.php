<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Support\PhotoSet;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Http\Requests\StoreInventoryItemRequest;
use App\Http\Requests\UpdateInventoryItemRequest;

class InventoryController extends Controller
{
    protected $logModule = 'Inventory';

    // Same upload convention as UserController::localUpload/localDelete
    // (Resident ID photo) and EventExpenseController::localUpload/localDelete
    // (expense receipt) -- the photo is optional proof/visual reference for
    // an inventory item, stored on the public disk so it can be shown via
    // photo_url (see InventoryItem::getPhotoUrlAttribute).
    private function localUpload($file): string
    {
        $original = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $ext      = $file->getClientOriginalExtension();
        $clean    = preg_replace('/[^A-Za-z0-9\-_.]/', '_', $original);
        $filename = time() . '_' . $clean . '.' . $ext;

        $path = $file->storeAs('inventory_photos', $filename, 'public');

        if (!$path) {
            throw new \Exception('File upload failed');
        }

        return $path;
    }

    private function localDelete(?string $path): void
    {
        if (!$path) {
            return;
        }
        try {
            Storage::disk('public')->delete($path);
        } catch (\Exception $e) {
            \Log::warning($e->getMessage());
        }
    }

    // UC-9: Manage Barangay Inventory
    /**
     * Condition filter shared by the grid and the reports. An item's condition
     * is New / Good / Fair / Poor; Lost and Disposed are not conditions but
     * unit counters (lost_quantity, lost_pending, disposed_quantity), so those
     * two filters match items that have at least one such unit.
     */
    public static function applyConditionFilter($query, string $condition): void
    {
        if ($condition === 'Lost') {
            $query->where(function ($q) {
                $q->where('lost_quantity', '>', 0)
                  ->orWhere('lost_pending', '>', 0);
            });
        } elseif ($condition === 'Disposed') {
            $query->where('disposed_quantity', '>', 0);
        } else {
            $query->where('condition', $condition);
        }
    }

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
            $this->applyConditionFilter($query, $request->condition);
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
    // Event form). Lost and disposed units are already taken out of the
    // in-stock quantity, so the borrow picker only needs the stock count.
    public function borrowable(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $items = InventoryItem::orderBy('name')
            ->get(['id', 'name', 'quantity', 'condition', 'storage_location']);

        return response()->json($items);
    }

    public function store(StoreInventoryItemRequest $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $data = $request->only(['name', 'quantity', 'condition', 'storage_location', 'notes']);

        if ($request->hasFile('photos')) {
            $res = PhotoSet::resolve([], $request, fn ($f) => $this->localUpload($f));
            $data['photo_path'] = $res['final'][0] ?? null;
            $data['extra_photo_paths'] = count($res['final']) > 1 ? array_slice($res['final'], 1) : null;
        } elseif ($request->hasFile('photo')) {
            $data['photo_path'] = $this->localUpload($request->file('photo'));
        }

        $item = InventoryItem::create($data);
        $this->createLog('Create', "Added inventory item: {$item->name}");

        return response()->json(['message' => 'Item added', 'item' => $item], 201);
    }

    public function update(UpdateInventoryItemRequest $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = InventoryItem::findOrFail($id);

        // Lost / disposed are tracked as UNIT counts (see below), never by
        // archiving the item -- a few lost or worn-out units must not take the
        // still-good ones out of Inventory or touch the loans in any way.
        $data = $request->only(['name', 'quantity', 'condition', 'storage_location', 'notes']);

        // Lost units -- reported per unit count, not by tagging the whole item.
        // They come out of the in-stock count right away; if the item is out on
        // loan and stock can't cover them, the rest is recorded as pending and
        // settled when the loan closes (InventoryItem::settleLostOnLoan).
        // Lowering the number ("found it") puts units back. The condition of
        // the units that are still good is never touched.
        $lostChange = false;
        if ($request->has('lost_quantity')) {
            $newLost = (int) $request->input('lost_quantity');
            $oldLost = (int) $item->lost_quantity;
            $stockAfter = array_key_exists('quantity', $data) ? (int) $data['quantity'] : (int) $item->quantity;
            $pending = (int) $item->lost_pending;
            $delta = $newLost - $oldLost;

            if ($delta > 0) {
                $fromStock = min($delta, $stockAfter);
                $toPending = $delta - $fromStock;
                $outNow = (int) $item->borrows()->sum('quantity');
                if ($toPending > max(0, $outNow - $pending)) {
                    return response()->json([
                        'message' => "Can't report {$delta} more as lost -- only {$stockAfter} in stock and {$outNow} out on loan.",
                    ], 422);
                }
                $data['quantity'] = $stockAfter - $fromStock;
                $pending += $toPending;
            } elseif ($delta < 0) {
                $found = -$delta;
                $fromPending = min($found, $pending);
                $data['quantity'] = $stockAfter + ($found - $fromPending);
                $pending -= $fromPending;
            }

            $data['lost_quantity'] = $newLost;
            $data['lost_pending'] = $pending;
            $lostChange = $delta !== 0;
        }

        // Disposed units -- worn-out/used-up units taken out of service. Only
        // units sitting in stock can be disposed of; lowering the number puts
        // them back. Same rule as lost units: the rest keep their condition.
        $disposedChange = false;
        if ($request->has('disposed_quantity')) {
            $newDisposed = (int) $request->input('disposed_quantity');
            $oldDisposed = (int) $item->disposed_quantity;
            $stockNow = array_key_exists('quantity', $data) ? (int) $data['quantity'] : (int) $item->quantity;
            $dDelta = $newDisposed - $oldDisposed;

            if ($dDelta > $stockNow) {
                return response()->json([
                    'message' => "Can't dispose {$dDelta} more -- only {$stockNow} in stock. Units out on loan have to come back first.",
                ], 422);
            }

            $data['quantity'] = $stockNow - $dDelta;
            $data['disposed_quantity'] = $newDisposed;
            $disposedChange = $dDelta !== 0;
        }

        // Photo handling:
        //   - New file picked  -> delete old file, save new one
        //   - remove_photo=1   -> delete old file, null the column
        //   - Neither          -> leave photo_path untouched
        //   - photos_sync=1    -> keep_photos[] (indexes to keep) + photos[]
        //                         (new files) describe the whole photo list;
        //                         first one is the cover, max 5.
        $removedPhotos = [];
        if ($request->boolean('photos_sync')) {
            $res = PhotoSet::resolve($item->allPhotoPaths(), $request, fn ($f) => $this->localUpload($f));
            $data['photo_path'] = $res['final'][0] ?? null;
            $data['extra_photo_paths'] = count($res['final']) > 1 ? array_slice($res['final'], 1) : null;
            $removedPhotos = $res['removed'];
        } elseif ($request->hasFile('photo')) {
            $this->localDelete($item->photo_path);
            $data['photo_path'] = $this->localUpload($request->file('photo'));
        } elseif ($request->boolean('remove_photo') && $item->photo_path) {
            $this->localDelete($item->photo_path);
            $data['photo_path'] = null;
        }

        $item->update($data);
        foreach ($removedPhotos as $gone) {
            $this->localDelete($gone);
        }
        if ($lostChange) {
            $item->settleLostOnLoan();
            $this->createLog('Update', "Updated lost units for {$item->name}: {$item->lost_quantity} lost");
        }
        if ($disposedChange) {
            $this->createLog('Update', "Updated disposed units for {$item->name}: {$item->disposed_quantity} disposed");
        }
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
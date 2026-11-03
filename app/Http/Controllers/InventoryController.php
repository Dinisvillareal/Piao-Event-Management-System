<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Models\InventoryUnitLog;
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
    private function localUpload($file, string $dir = 'inventory_photos'): string
    {
        $original = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $ext      = $file->getClientOriginalExtension();
        $clean    = preg_replace('/[^A-Za-z0-9\-_.]/', '_', $original);
        $filename = time() . '_' . \Illuminate\Support\Str::random(6) . '_' . $clean . '.' . $ext;

        $path = $file->storeAs($dir, $filename, 'public');

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
        } elseif (isset(InventoryItem::CONDITION_COLUMNS[$condition])) {
            // Items hold units in several conditions at once, so match any
            // item with at least one unit in this condition.
            $query->where(InventoryItem::CONDITION_COLUMNS[$condition], '>', 0);
        }
    }

    /** An item with this few units in stock counts as "low stock" (no reorder level exists). */
    private const LOW_STOCK_AT = 3;

    /**
     * Quick tabs of the Inventory list, done in the database so counts, paging
     * and the shown rows all agree: all | on-loan | low | lost-pending | attention.
     */
    private function applyInventoryTab($query, string $tab): void
    {
        switch ($tab) {
            case 'on-loan':
                $query->whereHas('borrows', fn ($b) => $b->where('quantity', '>', 0));
                break;
            case 'low':
                $query->where('quantity', '<=', self::LOW_STOCK_AT);
                break;
            case 'lost-pending':
                $query->where('lost_pending', '>', 0);
                break;
            case 'attention':
                $query->where(function ($q) {
                    $q->where('poor_quantity', '>', 0)
                      ->orWhere('lost_quantity', '>', 0)
                      // Out on loan to an event that has already ended.
                      ->orWhereHas('borrows.event', fn ($e) => $e->whereRaw('COALESCE(event_end, event_start) < ?', [now()]));
                });
                break;
        }
    }

    /**
     * When the form sends per-condition counts, the in-stock quantity is
     * their sum (the model keeps the two in step on save).
     */
    private function conditionData(Request $request, array $data): array
    {
        $cols = array_values(InventoryItem::CONDITION_COLUMNS);
        if (! $request->hasAny($cols)) {
            return $data;
        }
        foreach ($cols as $col) {
            if ($request->has($col)) {
                $data[$col] = max(0, (int) $request->input($col));
            }
        }
        $data['quantity'] = array_sum(array_map(fn ($c) => $data[$c] ?? 0, $cols));

        return $data;
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

        // paged=1: the Inventory screen asks for one page at a time, already
        // filtered (search, condition, quick tab) and sorted by the database,
        // plus the size of every tab. Without it, the full list comes back as
        // before (other screens use it for pickers and totals).
        $paged = $request->boolean('paged');
        $counts = null;
        if ($paged) {
            $counts = [];
            foreach (['all', 'on-loan', 'low', 'lost-pending', 'attention'] as $tabKey) {
                $tabQuery = clone $query;
                $this->applyInventoryTab($tabQuery, $tabKey);
                $counts[$tabKey] = $tabQuery->count();
            }
            $this->applyInventoryTab($query, (string) $request->input('tab', 'all'));
            switch ($request->input('sort')) {
                case 'name-za': $query->orderBy('name', 'desc'); break;
                case 'qty-high': $query->orderBy('quantity', 'desc')->orderBy('name'); break;
                case 'qty-low': $query->orderBy('quantity')->orderBy('name'); break;
                case 'recent': $query->orderBy('id', 'desc'); break;
                default: $query->orderBy('name');
            }
        } else {
            $query->orderBy('name');
        }

        // borrowed_quantity: how many units are currently lent out to a
        // still-active event (see InventoryItem::borrows()) -- the grid
        // uses this to grey out Delete on an item that's out on loan.
        // borrows.event is also loaded so we can flag a borrow whose event
        // has already ended -- staff have no other way to notice an item
        // is stuck on loan to a past event nobody archived yet.
        $query->withSum('borrows as borrowed_quantity', 'quantity')
            ->with(['borrows.event:id,name,event_start,event_end']);

        $paginator = null;
        if ($paged) {
            $perPage = max(1, min(100, (int) $request->input('per_page', 10)));
            $paginator = $query->paginate($perPage, ['*'], 'page', max(1, (int) $request->input('page', 1)));
            $items = $paginator->getCollection();
        } else {
            $items = $query->get();
        }

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

        if ($paginator) {
            return response()->json([
                'data' => $items->values(),
                'meta' => [
                    'total' => $paginator->total(),
                    'page' => $paginator->currentPage(),
                    'per_page' => $paginator->perPage(),
                    'last_page' => $paginator->lastPage(),
                ],
                'counts' => $counts,
            ]);
        }

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
            ->get(['id', 'name', 'quantity', 'new_quantity', 'good_quantity', 'fair_quantity', 'poor_quantity', 'storage_location']);

        return response()->json($items);
    }

    public function store(StoreInventoryItemRequest $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $data = $request->only(['name', 'quantity', 'storage_location', 'notes']);
        $data = $this->conditionData($request, $data);

        if ($request->hasFile('photo')) {
            $data['photo_path'] = $this->localUpload($request->file('photo'));
        }

        $item = InventoryItem::create($data);

        // Initial stock goes into the item's history too, so every count in
        // stock can be traced back to a record. The item photo (required on
        // the Add form) is the evidence for it.
        if ((int) $item->quantity > 0) {
            InventoryUnitLog::create([
                'inventory_item_id' => $item->id,
                'action' => 'added',
                'quantity' => (int) $item->quantity,
                'units' => $item->conditionCounts(),
                'user_code' => auth()->user()?->user_code,
            ]);
        }
        $this->createLog('Create', "Added inventory item: {$item->name}");

        return response()->json(['message' => 'Item added', 'item' => $item], 201);
    }

    public function update(UpdateInventoryItemRequest $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $labels = InventoryItem::CONDITION_COLUMNS; // label => column
        $removedPhotos = [];
        $deltas = [];
        $item = null;

        // One transaction on a locked row, like adjustUnits(): the new counts and
        // the history entry see the same numbers, so two staff can't overwrite
        // each other unnoticed.
        \DB::transaction(function () use ($request, $id, $labels, &$removedPhotos, &$deltas, &$item) {
            $item = InventoryItem::lockForUpdate()->findOrFail($id);
            $reject = fn (string $message, int $status = 422) => throw new \Illuminate\Http\Exceptions\HttpResponseException(
                response()->json(['message' => $message], $status)
            );

            // Lost / found / disposed units are never edited here -- they are
            // reported per condition with adjustUnits(), so the stock counts below
            // are only what is physically in stock.
            $data = $request->only(['name', 'quantity', 'storage_location', 'notes']);
            // Per-condition counts (when sent) decide the in-stock quantity.
            $data = $this->conditionData($request, $data);

            // The form sends the counts it was opened with (base_*). If the stock
            // has moved since (someone reported a loss, a release came back...),
            // saving would silently undo that, so ask to reopen instead.
            $before = $item->conditionCounts();
            foreach ($labels as $label => $col) {
                if ($request->has("base_{$col}") && (int) $request->input("base_{$col}") !== $before[$label]) {
                    return $reject("This item's stock changed while you were editing. Close this form, reopen the item and try again.", 409);
                }
            }

            // What this save changes in stock, per condition (+ added, - removed).
            // It is written to the item's history (who, when, how much) without a
            // photo: the item photo is the record, and evidence photos belong to
            // the lost / found / disposed / restored and release / return events.
            foreach ($labels as $label => $col) {
                $after = array_key_exists($col, $data) ? (int) $data[$col] : $before[$label];
                if ($after !== $before[$label]) {
                    $deltas[$label] = $after - $before[$label];
                }
            }

            // Photo handling:
            //   - New file picked  -> delete old file, save new one
            //   - remove_photo=1   -> delete old file, null the column
            //   - Neither          -> leave photo_path untouched
            if ($request->hasFile('photo')) {
                $removedPhotos = array_filter([$item->photo_path]);
                $data['photo_path'] = $this->localUpload($request->file('photo'));
            } elseif ($request->boolean('remove_photo') && $item->photo_path) {
                $removedPhotos = [$item->photo_path];
                $data['photo_path'] = null;
            }

            $item->update($data);

            if ($deltas) {
                InventoryUnitLog::create([
                    'inventory_item_id' => $item->id,
                    'action' => 'adjusted',
                    'quantity' => array_sum(array_map('abs', $deltas)),
                    'units' => $deltas,
                    'user_code' => auth()->user()?->user_code,
                ]);
            }
        });

        foreach ($removedPhotos as $gone) {
            $this->localDelete($gone);
        }

        $change = [];
        foreach ($deltas as $label => $n) {
            $change[] = ($n > 0 ? '+' : '') . "{$n} {$label}";
        }
        $this->createLog('Update', "Updated inventory item: {$item->name}" . ($change ? ' (stock ' . implode(', ', $change) . ')' : ''));

        return response()->json(['message' => 'Item updated', 'item' => $item->refresh()]);
    }

    /**
     * Lost / found / disposed / restored units, all in one place. Staff pick
     * exactly which units, per condition (3 Good + 2 Fair), so nothing is
     * chosen at random.
     *  - lost:     units missing from stock leave stock and join the lost count
     *              (units lost on a loan are reported from Returns instead);
     *  - found:    lost units that turned up. Units still counted on an open
     *              loan (lost_pending) simply stop being lost; the rest go into
     *              stock under the conditions given. Also the fix for a unit
     *              marked lost by mistake -- it returns to stock, not to the loan;
     *  - disposed: unusable units leave stock and join the disposed count;
     *  - restored: disposed units that are usable again go back into stock.
     * Disposed / restored / found need 1-5 evidence photos. Every report is
     * kept in inventory_unit_logs and the activity log.
     */
    public function adjustUnits(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'action' => 'required|in:lost,found,disposed,restored',
            'units' => 'nullable|array',
            'units.*' => 'nullable|integer|min:0',
            // found only: how many of the lost units were found.
            'quantity' => 'nullable|integer|min:1',
            // Evidence photos (up to 5): required for disposed / restored / found.
            'photos' => 'nullable|array|max:5',
            'photos.*' => 'image|max:5120',
        ]);

        $action = $request->input('action');
        $labels = array_keys(InventoryItem::CONDITION_COLUMNS);

        $units = [];
        foreach ($labels as $label) {
            $units[$label] = max(0, (int) $request->input("units.{$label}", 0));
        }
        $total = array_sum($units);
        // Evidence is required for disposed / restored / found -- checked up front so nothing is locked or uploaded without it.
        if (in_array($action, ['disposed', 'restored', 'found'], true)
            && count(array_filter((array) $request->file('photos', []))) < 1) {
            return response()->json(['message' => 'Attach at least one evidence photo.'], 422);
        }

        // Something that fails the checks below must answer 422 and roll everything back.
        $fail = fn (string $message) => throw new \Illuminate\Http\Exceptions\HttpResponseException(
            response()->json(['message' => $message], 422)
        );

        $quantity = $total;
        $photos = [];
        $item = null;

        try {
            // One transaction on a locked row: the checks and the writes see the same
            // numbers, so two staff acting on the same item at once can't both pass
            // the checks (e.g. restore the same disposed units twice). The ledger row
            // is written in the same transaction, so counts and history never disagree.
            \DB::transaction(function () use ($id, $request, $action, $units, $total, &$quantity, &$photos, &$item, $fail) {
                $item = InventoryItem::lockForUpdate()->findOrFail($id);

                if ($action === 'lost' || $action === 'disposed') {
                    if ($total <= 0) {
                        return $fail('Enter how many units to report.');
                    }
                    $have = $item->conditionCounts();
                    foreach ($units as $label => $n) {
                        if ($n > $have[$label]) {
                            return $fail("Can't take {$n} {$label} unit(s) -- only {$have[$label]} {$label} in stock.");
                        }
                    }
                } elseif ($action === 'restored') {
                    if ($total <= 0) {
                        return $fail('Enter how many units to put back.');
                    }
                    if ($total > (int) $item->disposed_quantity) {
                        return $fail("Can't restore {$total} -- only {$item->disposed_quantity} are recorded as disposed.");
                    }
                    // Only units of the condition they were disposed in can be restored
                    // (4 Good disposed -> only Good comes back). Units disposed before
                    // conditions were recorded can go back into any condition.
                    $b = $this->disposedBreakdown($item);
                    $overflow = 0;
                    foreach ($units as $label => $n) {
                        $overflow += max(0, $n - $b['known'][$label]);
                    }
                    if ($overflow > $b['unknown']) {
                        $parts = [];
                        foreach ($b['known'] as $label => $n) {
                            if ($n > 0) {
                                $parts[] = "{$n} {$label}";
                            }
                        }
                        return $fail("Those units weren't disposed in that condition. Disposed: " . ($parts ? implode(', ', $parts) : 'unknown condition') . '.');
                    }
                } else {
                    $quantity = (int) $request->input('quantity', 0);
                    $lostNow = (int) $item->lost_quantity;
                    if ($quantity < 1 || $quantity > $lostNow) {
                        return $fail($lostNow > 0 ? "Can't mark {$quantity} as found -- only {$lostNow} are recorded as lost." : 'No units are recorded as lost for this item.');
                    }
                    $fromPending = min($quantity, (int) $item->lost_pending);
                    $toStock = $quantity - $fromPending;
                    if ($total !== $toStock) {
                        return $fail($toStock > 0
                            ? "Say which condition the {$toStock} unit(s) coming back to stock are in -- the counts must add up to {$toStock}."
                            : 'These units are still counted on an open loan, so no condition is needed.');
                    }
                }


                if (in_array($action, ['disposed', 'restored', 'found'], true)) {
                    $photos = PhotoSet::resolve([], $request, fn ($f) => $this->localUpload($f, 'inventory_unit_photos'))['final'];
                }

                if ($action === 'lost') {
                    $item->lost_quantity = (int) $item->lost_quantity + $total;
                    $item->takeUnits($units);
                } elseif ($action === 'disposed') {
                    $item->disposed_quantity = (int) $item->disposed_quantity + $total;
                    $item->takeUnits($units);
                } elseif ($action === 'restored') {
                    $item->disposed_quantity = (int) $item->disposed_quantity - $total;
                    $item->giveUnits($units);
                } else {
                    $fromPending = min($quantity, (int) $item->lost_pending);
                    $item->lost_quantity = (int) $item->lost_quantity - $quantity;
                    $item->lost_pending = (int) $item->lost_pending - $fromPending;
                    $total > 0 ? $item->giveUnits($units) : $item->save();
                }

                InventoryUnitLog::create([
                    'inventory_item_id' => $item->id,
                    'action' => $action,
                    'quantity' => $quantity,
                    'units' => $total > 0 ? $units : null,
                    'photo_path' => $photos[0] ?? null,
                    'extra_photo_paths' => count($photos) > 1 ? array_slice($photos, 1) : null,
                    'user_code' => auth()->user()?->user_code,
                ]);
            });
        } catch (\Throwable $e) {
            // Don't leave evidence files behind when the save didn't go through.
            foreach ($photos as $path) {
                $this->localDelete($path);
            }
            throw $e;
        }

        $parts = [];
        foreach ($units as $label => $n) {
            if ($n > 0) {
                $parts[] = "{$n} {$label}";
            }
        }
        $verb = ['lost' => 'reported lost', 'found' => 'marked as found', 'disposed' => 'disposed', 'restored' => 'restored from disposed'][$action];
        $this->createLog('Update', "{$quantity} unit(s) of {$item->name} {$verb}" . ($parts ? ' (' . implode(', ', $parts) . ')' : ' (still on loan)'));

        return response()->json(['message' => 'Units updated.', 'item' => $item->refresh()]);
    }

    /** The recent lost / found / disposed / restored reports for one item, newest first. */
    public function unitLogs($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = InventoryItem::withTrashed()->findOrFail($id);
        $logs = InventoryUnitLog::where('inventory_item_id', $item->id)->latest('id')->limit(100)->get();
        $people = \App\Models\User::whereIn('user_code', $logs->pluck('user_code')->filter()->unique())
            ->get(['user_code', 'first_name', 'last_name'])->keyBy('user_code');
        $events = \App\Models\Event::withTrashed()->whereIn('id', $logs->pluck('event_id')->filter()->unique())->pluck('name', 'id');

        return response()->json([
            // Which conditions the disposed units were in -- the Restore tab only offers those.
            'disposed' => $this->disposedBreakdown($item),
            'logs' => $logs->map(fn ($l) => [
                'id' => $l->id,
                'action' => $l->action,
                'quantity' => $l->quantity,
                'units' => $l->units,
                'photo_urls' => $l->photo_urls,
                'event_name' => $l->event_id ? ($events[$l->event_id] ?? null) : null,
                'by' => ($p = $people->get($l->user_code)) ? trim($p->first_name . ' ' . $p->last_name) : ($l->user_code ?: 'System'),
                'at' => $l->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    /**
     * Disposed units per condition, from the disposed / restored reports, plus
     * how many disposed units have no recorded condition (disposed before
     * conditions were tracked).
     *
     * @return array{known: array<string,int>, unknown: int}
     */
    private function disposedBreakdown(InventoryItem $item): array
    {
        $known = array_fill_keys(array_keys(InventoryItem::CONDITION_COLUMNS), 0);
        $logs = InventoryUnitLog::where('inventory_item_id', $item->id)->whereIn('action', ['disposed', 'restored'])->get();
        foreach ($logs as $log) {
            $sign = $log->action === 'disposed' ? 1 : -1;
            foreach ($known as $label => $n) {
                $known[$label] += $sign * (int) ($log->units[$label] ?? 0);
            }
        }
        foreach ($known as $label => $n) {
            $known[$label] = max(0, $n);
        }

        return ['known' => $known, 'unknown' => max(0, (int) $item->disposed_quantity - array_sum($known))];
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
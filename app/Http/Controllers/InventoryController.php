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
     * is New / Good / Fair / Poor; Lost is not a condition but a unit counter
     * (lost_quantity), so that filter matches items that have at least one
     * lost unit.
     */
    public static function applyConditionFilter($query, string $condition): void
    {
        if ($condition === 'Lost') {
            $query->where('lost_quantity', '>', 0);
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
     * and the shown rows all agree: all | on-loan | low | attention.
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
            foreach (['all', 'on-loan', 'low', 'attention'] as $tabKey) {
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
    // Event form). Lost units are already taken out of the
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

            // Lost / found units are never edited here -- they are
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
            // the lost / found and release / return events.
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
     * Marks lost units as found. Units are only ever reported lost from an
     * event's loan (Returns -> Report Lost), so this is the way back for those
     * units: staff enter how many came back in each condition (3 Good + 2 Fair).
     * The report belongs to the item, not to an event.
     * The found units go back into stock in the condition they were lost in:
     * a condition can't be given more units than were recorded as lost in it
     * (InventoryItem::lostByCondition), so Good units can't come back as New or
     * Poor. The total is the sum of the counts. It is also the fix for a unit
     * marked lost by mistake. Needs 1-5 evidence photos. Every report is kept in
     * inventory_unit_logs and the activity log.
     */
    public function adjustUnits(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'action' => 'required|in:found',
            'units' => 'nullable|array',
            'units.*' => 'nullable|integer|min:0',
            // Evidence photos (up to 5): required for found.
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
        // Evidence is required -- checked up front so nothing is locked or uploaded without it.
        if (count(array_filter((array) $request->file('photos', []))) < 1) {
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
            // the checks (e.g. mark the same lost units as found twice). The ledger row
            // is written in the same transaction, so counts and history never disagree.
            \DB::transaction(function () use ($id, $request, $action, $units, $total, &$quantity, &$photos, &$item, $fail) {
                $item = InventoryItem::lockForUpdate()->findOrFail($id);

                // The found units are entered by condition, so the total is simply their sum.
                $quantity = $total;
                $returnable = max(0, (int) $item->lost_quantity);
                if ($returnable < 1) {
                    return $fail('No lost units can be returned to stock for this item right now.');
                }
                if ($quantity < 1) {
                    return $fail('Enter how many units were found in each condition.');
                }
                if ($quantity > $returnable) {
                    return $fail("Can't mark {$quantity} as found -- only {$returnable} are recorded as lost.");
                }
                // Each condition is limited to what was lost in that condition.
                foreach ($item->lostByCondition() as $label => $lostHere) {
                    if (($units[$label] ?? 0) > $lostHere) {
                        return $fail($lostHere > 0
                            ? "Can't mark {$units[$label]} {$label} as found -- only {$lostHere} {$label} were recorded as lost."
                            : "Can't mark {$label} units as found -- none were recorded as lost in that condition.");
                    }
                }

                // Nobody can prove where a recovered item came from -- a photo of a chair looks the
                // same for every event -- so a recovery is recorded on the item and is never tied
                // to an event. Each event keeps the loss exactly as it was recorded at return.
                $photos = PhotoSet::resolve([], $request, fn ($f) => $this->localUpload($f, 'inventory_unit_photos'))['final'];

                $item->lost_quantity = (int) $item->lost_quantity - $quantity;
                $item->giveUnits($units);

                InventoryUnitLog::create([
                    'inventory_item_id' => $item->id,
                    'event_id' => null,
                    'action' => $action,
                    'quantity' => $quantity,
                    'units' => $units,
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
        $this->createLog('Update', "{$quantity} unit(s) of {$item->name} marked as found" . ($parts ? ' (' . implode(', ', $parts) . ')' : ' (still on loan)'));

        return response()->json(['message' => 'Units updated.', 'item' => $item->refresh()]);
    }

    /**
     * Undoes a "found" report that was entered wrongly (wrong condition split,
     * wrong item): those units leave stock again, in exactly the conditions they
     * were found in, and go back to lost. The entry stays in the history marked
     * as undone (never deleted), so the audit trail stays whole. It is refused
     * when the units are no longer in stock (an event borrowed them again), the
     * same rule as undoing a release on the Returns page. To correct a wrong
     * split, undo it and record the found units again.
     */
    public function undoFound(Request $request, $id, $logId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $fail = fn (string $message) => throw new \Illuminate\Http\Exceptions\HttpResponseException(
            response()->json(['message' => $message], 422)
        );

        $item = null;
        $log = null;
        \DB::transaction(function () use ($id, $logId, &$item, &$log, $fail) {
            $item = InventoryItem::lockForUpdate()->findOrFail($id);
            $log = InventoryUnitLog::where('inventory_item_id', $item->id)->lockForUpdate()->findOrFail($logId);

            if ($log->action !== 'found') {
                return $fail('Only a found report can be undone.');
            }
            if ($log->undone_at) {
                return $fail('This report has already been undone.');
            }

            $units = [];
            foreach (array_keys(InventoryItem::CONDITION_COLUMNS) as $label) {
                $units[$label] = max(0, (int) ($log->units[$label] ?? 0));
            }
            $short = $item->shortfall($units);
            if ($short) {
                $parts = [];
                foreach ($short as $label => $n) {
                    $parts[] = "{$n} {$label}";
                }

                return $fail('Can\'t undo: ' . implode(', ', $parts) . ' of these units are no longer in stock (they were lent out again). Return them first.');
            }

            $item->takeUnits($units);
            $item->lost_quantity = (int) $item->lost_quantity + (int) $log->quantity;
            $item->save();

            $log->undone_at = now();
            $log->undone_by = auth()->user()?->user_code;
            $log->save();
        });

        $this->createLog('Update', "Undid a found report of {$log->quantity} unit(s) of {$item->name}; they are marked as lost again");

        return response()->json(['message' => 'Found report undone.', 'item' => $item->refresh()]);
    }

    /**
     * Corrects how many units a found report covered, per condition (for example 1
     * found instead of 2), and optionally its evidence photos (kept unless replaced,
     * 1-5 required, same as on Returns). The old entry is marked undone and a
     * replacement entry with the corrected units and photos is written in the same
     * transaction. The old entry keeps its own photos, so the original upload stays
     * visible in the history and nothing is rewritten.
     * Rules: each condition can go up only to what is still lost in it, and down only
     * by units that are still in stock (not lent out again). Fewer found means the
     * difference is lost again; no units at all is an Undo instead.
     */
    public function editFound(Request $request, $id, $logId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'units' => 'required|array',
            'units.*' => 'nullable|integer|min:0',
            'photos' => 'nullable|array|max:5',
            'photos.*' => 'image|max:5120',
        ]);

        $fail = fn (string $message) => throw new \Illuminate\Http\Exceptions\HttpResponseException(
            response()->json(['message' => $message], 422)
        );

        $labels = array_keys(InventoryItem::CONDITION_COLUMNS);
        $new = [];
        foreach ($labels as $label) {
            $new[$label] = max(0, (int) $request->input("units.{$label}", 0));
        }

        $item = null;
        $oldQty = 0;
        $newQty = array_sum($new);
        $uploaded = [];
        try {
        \DB::transaction(function () use ($id, $logId, $labels, $new, $newQty, $request, &$item, &$oldQty, &$uploaded, $fail) {
            $item = InventoryItem::lockForUpdate()->findOrFail($id);
            $log = InventoryUnitLog::where('inventory_item_id', $item->id)->lockForUpdate()->findOrFail($logId);

            if ($log->action !== 'found') {
                return $fail('Only a found report can be edited.');
            }
            if ($log->undone_at) {
                return $fail('This report was already undone or corrected.');
            }

            $old = [];
            foreach ($labels as $label) {
                $old[$label] = max(0, (int) ($log->units[$label] ?? 0));
            }
            $oldQty = array_sum($old);

            if ($newQty < 1) {
                return $fail('Enter how many units were found. To remove this report entirely, use Undo.');
            }
            // Photos: kept unless the request describes a new list (keep_photos[] + photos[]).
            $currentPhotos = array_values(array_filter(array_merge([$log->photo_path], $log->extra_photo_paths ?? [])));
            $finalPhotos = $currentPhotos;
            $photosChanged = false;
            if ($request->boolean('photos_sync')) {
                $plan = PhotoSet::plan($currentPhotos, $request);
                $photosChanged = count($plan['files']) > 0 || $plan['kept'] !== $currentPhotos;
                if (count($plan['kept']) + count($plan['files']) < 1) {
                    return $fail('Attach at least one evidence photo.');
                }
                if ($photosChanged) {
                    $finalPhotos = PhotoSet::resolve($currentPhotos, $request, fn ($f) => $this->localUpload($f, 'inventory_unit_photos'))['final'];
                    $uploaded = array_values(array_diff($finalPhotos, $currentPhotos));
                }
            }

            if ($new === $old && !$photosChanged) {
                return $fail('Nothing was changed.');
            }

            // Up: only what is still lost in that condition. Down: only units still in stock.
            $lostBy = $item->lostByCondition();
            $give = [];
            $take = [];
            foreach ($labels as $label) {
                $delta = $new[$label] - $old[$label];
                if ($delta > 0) {
                    if ($delta > ($lostBy[$label] ?? 0)) {
                        return $fail("Can't raise {$label} to {$new[$label]} -- only " . ($lostBy[$label] ?? 0) . " more {$label} are recorded as lost.");
                    }
                    $give[$label] = $delta;
                } elseif ($delta < 0) {
                    $take[$label] = -$delta;
                }
            }
            if ($short = $item->shortfall($take)) {
                $parts = [];
                foreach ($short as $label => $n) {
                    $parts[] = "{$n} {$label}";
                }

                return $fail('Can\'t lower this: ' . implode(', ', $parts) . ' of these units are no longer in stock (they were lent out again). Return them first.');
            }

            if ($take) {
                $item->takeUnits($take);
            }
            if ($give) {
                $item->giveUnits($give);
            }
            $item->lost_quantity = max(0, (int) $item->lost_quantity + $oldQty - $newQty);
            $item->save();

            $log->undone_at = now();
            $log->undone_by = auth()->user()?->user_code;
            $log->save();

            InventoryUnitLog::create([
                'inventory_item_id' => $item->id,
                'event_id' => null,
                'action' => 'found',
                'quantity' => $newQty,
                'units' => $new,
                'photo_path' => $finalPhotos[0] ?? null,
                'extra_photo_paths' => count($finalPhotos) > 1 ? array_slice($finalPhotos, 1) : null,
                'user_code' => auth()->user()?->user_code,
            ]);
        });
        } catch (\Throwable $e) {
            // Don't leave newly uploaded evidence behind when the save didn't go through.
            foreach ($uploaded as $path) {
                $this->localDelete($path);
            }
            throw $e;
        }

        $this->createLog('Update', "Corrected a found report for {$item->name}: {$oldQty} -> {$newQty} unit(s) found");

        return response()->json(['message' => 'Found report corrected.', 'item' => $item->refresh()]);
    }

    /** The recent lost / found reports (lost ones come from event loans) and stock adjustments for one item, newest first. */
    public function unitLogs($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = InventoryItem::withTrashed()->findOrFail($id);
        // Older write-off entries (disposed / restored) are kept in the table but no longer shown.
        $logs = InventoryUnitLog::where('inventory_item_id', $item->id)
            ->whereNotIn('action', ['disposed', 'restored'])->latest('id')->limit(100)->get();
        $people = \App\Models\User::whereIn('user_code', $logs->pluck('user_code')->merge($logs->pluck('undone_by'))->filter()->unique())
            ->get(['user_code', 'first_name', 'last_name'])->keyBy('user_code');
        $events = \App\Models\Event::withTrashed()->whereIn('id', $logs->pluck('event_id')->filter()->unique())->pluck('name', 'id');

        return response()->json([
            // Lost units still outstanding, per condition -- what the Found form offers.
            'lost_by' => $item->lostByCondition(),
            // The whole picture for this item. Recoveries are never tied to an event, so the
            // event's own "lost" stays as recorded and the item shows what is still missing.
            'summary' => [
                'lost' => (int) InventoryUnitLog::where('inventory_item_id', $item->id)->where('action', 'lost')->whereNull('undone_at')->sum('quantity'),
                'recovered' => $item->recoveredTotal(),
                'missing' => (int) $item->lost_quantity,
            ],
            'logs' => $logs->map(fn ($l) => [
                'id' => $l->id,
                'action' => $l->action,
                'quantity' => $l->quantity,
                'units' => $l->units,
                'photo_urls' => $l->photo_urls,
                'undone_at' => $l->undone_at?->toIso8601String(),
                'undone_by' => $l->undone_by ? (($p = $people->get($l->undone_by)) ? trim($p->first_name . ' ' . $p->last_name) : $l->undone_by) : null,
                'event_id' => $l->event_id,
                'event_name' => $l->event_id ? ($events[$l->event_id] ?? null) : null,
                'by' => ($p = $people->get($l->user_code)) ? trim($p->first_name . ' ' . $p->last_name) : ($l->user_code ?: 'System'),
                'at' => $l->created_at?->toIso8601String(),
            ])->values(),
        ]);
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
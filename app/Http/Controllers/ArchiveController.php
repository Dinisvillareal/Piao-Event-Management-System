<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use App\Models\ActivityLog;
use App\Models\AgeBracket;
use App\Models\CivilStatus;
use App\Models\CurrentStatus;
use App\Models\InventoryItem;
use App\Models\EventExpense;
use App\Models\Household;
use App\Support\Paged;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ArchiveController extends Controller
{
    public function index(Request $request)
    {
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // The Archive screen: one filtered, sorted page straight from the database.
        if ($request->boolean('paged')) {
            return $this->pagedArchive($request);
        }

        $memberships = Membership::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'membership',
                'name'      => $item->name,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $events = Event::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'event',
                'name'      => $item->name,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $users = User::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'resident',
                'name'      => $item->first_name . ' ' . $item->last_name,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

            $notifications = Notification::where('type', 'event_deleted')
                ->whereNotNull('event_id')
                ->with('event')
                ->orderBy('updated_at', 'desc')
                ->get()
                ->unique('event_id')
                ->values()
                ->map(fn($item) => [
                    'id'        => $item->event_id,
                    'type'      => 'notification',
                    'name'      => $item->title,
                    'deletedAt' => optional($item->updated_at)->format('Y-m-d H:i:s'),
                    'deletedBy' => $item->event?->deleted_by ?? 'SYSTEM',
                ]);

        $ageBrackets = AgeBracket::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'age_bracket',
                'name'      => $item->label,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $civilStatuses = CivilStatus::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'civil_status',
                'name'      => $item->label,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $currentStatuses = CurrentStatus::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'current_status',
                'name'      => $item->label,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $inventoryItems = InventoryItem::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'inventory_item',
                'name'      => $item->name,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $expenses = EventExpense::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'expense',
                'name'      => $item->item,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $households = Household::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id'        => $item->id,
                'type'      => 'household',
                'name'      => $item->code,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $archivedItems = array_merge(
            $memberships->toArray(),
            $events->toArray(),
            $users->toArray(),
            $notifications->toArray(),
            $ageBrackets->toArray(),
            $civilStatuses->toArray(),
            $currentStatuses->toArray(),
            $inventoryItems->toArray(),
            $expenses->toArray(),
            $households->toArray()
        );

        usort($archivedItems, function ($a, $b) {
            return strtotime($b['deletedAt']) <=> strtotime($a['deletedAt']);
        });

        return response()->json($archivedItems);
    }

    /**
     * Every archived record of every kind as ONE list of
     * { id, type, name, deleted_at, deleted_by } rows, built by the database (a UNION of the
     * ten tables). Filtering, sorting, counting and paging are then done by the database too,
     * so the screen never loads the whole archive into memory.
     */
    private function archiveUnion(): \Illuminate\Database\Query\Builder
    {
        $sqlite = DB::connection()->getDriverName() === 'sqlite';
        $fullName = $sqlite ? "first_name || ' ' || last_name" : "CONCAT(first_name, ' ', last_name)";
        $by = "COALESCE(NULLIF(deleted_by, ''), 'SYSTEM')";

        $soft = fn (string $table, string $type, string $nameExpr) => DB::table($table)
            ->whereNotNull('deleted_at')
            ->selectRaw("id, '{$type}' as type, {$nameExpr} as name, deleted_at, {$by} as deleted_by");

        // An event's "cancelled" announcement, one row per event (the newest wins).
        $notifications = DB::table('notifications as n')
            ->where('n.type', 'event_deleted')
            ->whereNotNull('n.event_id')
            ->groupBy('n.event_id')
            ->selectRaw("n.event_id as id, 'notification' as type, MAX(n.title) as name, MAX(n.updated_at) as deleted_at, "
                . "COALESCE(NULLIF((select e.deleted_by from events e where e.id = n.event_id), ''), 'SYSTEM') as deleted_by");

        return $soft('memberships', 'membership', 'name')
            ->unionAll($soft('events', 'event', 'name'))
            ->unionAll($soft('users', 'resident', $fullName))
            ->unionAll($notifications)
            ->unionAll($soft('age_brackets', 'age_bracket', 'label'))
            ->unionAll($soft('civil_statuses', 'civil_status', 'label'))
            ->unionAll($soft('current_statuses', 'current_status', 'label'))
            ->unionAll($soft('inventory_items', 'inventory_item', 'name'))
            ->unionAll($soft('event_expenses', 'expense', 'item'))
            ->unionAll($soft('households', 'household', 'code'));
    }

    private function pagedArchive(Request $request)
    {
        $source = fn () => DB::query()->fromSub($this->archiveUnion(), 'a');

        // Figures for the whole archive (not narrowed by the filters below).
        $agg = $source()->selectRaw('COUNT(*) as total, COUNT(DISTINCT type) as kinds, MAX(deleted_at) as newest, MIN(deleted_at) as oldest')->first();
        $newest = $agg->newest ? strtotime($agg->newest) : null;
        $oldest = $agg->oldest ? strtotime($agg->oldest) : null;
        $stats = [
            'total' => (int) $agg->total,
            'distinct_types' => (int) $agg->kinds,
            'newest_at' => $newest ? date('c', $newest) : null,
            'oldest_days' => $oldest ? (int) floor((time() - $oldest) / 86400) : 0,
        ];

        $query = $source();
        if ($request->filled('type') && $request->input('type') !== 'all') {
            $query->where('type', (string) $request->input('type'));
        }
        // Every typed word must appear in the name, the kind or who deleted it.
        // (Paged::like escapes % and _ with a backslash; MySQL reads that by default, SQLite needs it declared.)
        $esc = DB::connection()->getDriverName() === 'sqlite' ? " ESCAPE '\\'" : '';
        foreach (Paged::tokens($request->input('search')) as $word) {
            $like = Paged::like($word);
            $query->where(fn ($q) => $q->whereRaw("LOWER(name) LIKE ?{$esc}", [$like])
                ->orWhereRaw("LOWER(type) LIKE ?{$esc}", [$like])
                ->orWhereRaw("LOWER(deleted_by) LIKE ?{$esc}", [$like]));
        }

        match ($request->input('sort')) {
            'oldest' => $query->orderBy('deleted_at')->orderBy('id'),
            'name-az' => $query->orderByRaw('LOWER(name)')->orderBy('id'),
            default => $query->orderByDesc('deleted_at')->orderByDesc('id'),
        };

        $paginator = $query->paginate(Paged::perPage($request, 20), ['*'], 'page', Paged::page($request));
        $rows = collect($paginator->items())->map(fn ($r) => [
            'id' => (int) $r->id,
            'type' => $r->type,
            'name' => $r->name,
            'deletedAt' => $r->deleted_at ? date('Y-m-d H:i:s', strtotime($r->deleted_at)) : null,
            'deletedBy' => $r->deleted_by,
        ])->values();

        return response()->json(Paged::body($paginator, $rows, ['stats' => $stats]));
    }

    public function restore(Request $request)
    {
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'type' => 'required|string|in:membership,event,resident,notification,age_bracket,civil_status,current_status,inventory_item,expense,household',
            'id'   => 'required|integer',
        ]);

        // One restore of the same record at a time. Two staff clicking Restore
        // together used to both succeed and both write the "restored" log and
        // notifications; now the second one finds it already restored.
        return $this->exclusively(
            'restore:' . $request->type . ':' . (int) $request->id,
            fn () => $this->restoreLocked($request)
        );
    }

    //LAST WORKING IMPLEMENTATION
    // private function restoreLocked(Request $request)
    // {
    //     try {
    //         $itemName = '';

    //         switch ($request->type) {

    //             case 'inventory_item':
    //                 $item = InventoryItem::onlyTrashed()->findOrFail($request->id);
    //                 $itemName = $item->name;
    //                 $item->deleted_by = null;
    //                 $item->restore();
    //                 break;

    //             case 'expense':
    //                 $item = EventExpense::onlyTrashed()->findOrFail($request->id);
    //                 $itemName = $item->item;

    //                 // An ended event's budget is locked (no adding, editing or deleting
    //                 // expenses), so a removed expense can't quietly come back into it either.
    //                 $expenseEvent = Event::withTrashed()->find($item->event_id);
    //                 if ($expenseEvent && $expenseEvent->hasEnded()) {
    //                     return response()->json([
    //                         'message' => 'This event has already ended, so its expenses can no longer be changed.',
    //                     ], 422);
    //                 }

    //                 $item->deleted_by = null;
    //                 $item->save();
    //                 $item->restore();
    //                 break;

    //             case 'age_bracket':
    //                 $item = AgeBracket::onlyTrashed()->findOrFail($request->id);
    //                 $itemName = $item->label;
    //                 $item->deleted_by = null;
    //                 $item->restore();
    //                 AgeBracket::forgetCache();
    //                 break;

    //             case 'civil_status':
    //                 $item = CivilStatus::onlyTrashed()->findOrFail($request->id);
    //                 $itemName = $item->label;
    //                 $item->deleted_by = null;
    //                 $item->restore();
    //                 CivilStatus::forgetCache();
    //                 break;

    //             case 'current_status':
    //                 $item = CurrentStatus::onlyTrashed()->findOrFail($request->id);
    //                 $itemName = $item->label;
    //                 $item->deleted_by = null;
    //                 $item->restore();
    //                 CurrentStatus::forgetCache();
    //                 break;

    //             case 'membership':
    //                 $item = Membership::onlyTrashed()->findOrFail($request->id);
    //                 $itemName = $item->name;
    //                 $item->restore();
    //                 $item->update(['is_active' => true, 'deactivated_at' => null]);
    //                 break;

    //             case 'notification':
    //             case 'event':
    //                 $item = Event::withTrashed()->findOrFail($request->id);
    //                 $itemName = $item->name;

    //                 if (!$item->trashed()) {
    //                     // Someone else restored it a moment ago: nothing to do,
    //                     // and nothing to log or notify a second time.
    //                     return response()->json(['message' => 'Item restored successfully']);
    //                 }

    //                 DB::beginTransaction();
    //                 try {
    //                     $item->deleted_by = null;
    //                     $item->save();

    //                     if ($item->trashed()) {
    //                         $item->restore();
    //                     }

    //                     $staffName       = 'Staff: ' . (auth()->user()->last_name ?? 'Unknown');
    //                     $restoredTitle   = 'Event Restored: ' . $item->name;
    //                     $restoredMessage = $staffName . ' • ' . $item->name . ' — ' .
    //                         ($item->notification_message ?? 'This event has been restored and is active again.');

    //                     $affectedNotifications = Notification::where('event_id', $item->id)
    //                         ->where('type', 'event_deleted')
    //                         ->update([
    //                             'type'                    => 'event_updated',
    //                             'title'                   => $restoredTitle,
    //                             'message'                 => $restoredMessage,
    //                             'is_updated'              => true,
    //                             'updated_at_notification' => now(),
    //                             'read'                    => false,
    //                             'updated_at'              => now(),
    //                         ]);

    //                     DB::commit();

    //                     // ✅ Log the event restore
    //                     $this->createLog(
    //                         'Restore',
    //                         'Events',
    //                         "Restored event: '{$itemName}'"
    //                     );

    //                     // ✅ Log the notification update separately
    //                     $this->createLog(
    //                         'Update',
    //                         'Notifications',
    //                         "Restored notifications for event: '{$itemName}' — {$affectedNotifications} recipient(s) notified"
    //                     );

    //                     // ✅ Override the generic log below so we don't double-log
    //                     $itemName = '';

    //                 } catch (\Exception $e) {
    //                     DB::rollBack();
    //                     throw $e;
    //                 }
    //                 break;

    //             case 'resident':
    //                 $item = User::onlyTrashed()->findOrFail($request->id);
    //                 $itemName = $item->first_name . ' ' . $item->last_name;
    //                 $item->deleted_by = null;
    //                 $item->save();
    //                 $item->restore();
    //                 break;

    //             case 'household':
    //                 $item = Household::onlyTrashed()->findOrFail($request->id);
    //                 $itemName = $item->code;
    //                 // The household and the people it had come back together (those
    //                 // who are still free to be linked).
    //                 $relinked = \Illuminate\Support\Facades\DB::transaction(function () use ($item) {
    //                     $item->deleted_by = null;
    //                     $item->save();
    //                     $item->restore();

    //                     return $item->relinkDissolvedMembers();
    //                 });
    //                 $logExtra = $relinked['linked'] || $relinked['skipped']
    //                     ? " ({$relinked['linked']} member(s) linked back" . ($relinked['skipped'] ? ", {$relinked['skipped']} could not be" : '') . ')'
    //                     : '';
    //                 break;
    //         }

    //         // Events log their own (more detailed) entries above; every other kind is logged here.
    //         if ($itemName !== '') {
    //             $this->createLog(
    //                 'Restore',
    //                 'Archive',
    //                 "Restored {$request->type} '{$itemName}'" . ($logExtra ?? '')
    //             );
    //         }

    //         return response()->json(['message' => 'Item restored successfully'] + (isset($relinked) ? ['relinked' => $relinked['linked'], 'not_relinked' => $relinked['skipped']] : []));

    //     } catch (\Exception $e) {
    //         return response()->json(['message' => $this->safeError($e)], 500);
    //     }
    // }

    private function restoreLocked(Request $request)
    {
        try {
            $itemName = '';

            switch ($request->type) {

                case 'inventory_item':
                    $item = InventoryItem::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->deleted_by = null;
                    $item->restore();
                    break;

                case 'expense':
                    $item = EventExpense::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->item;

                    // An ended event's budget is locked (no adding, editing or deleting
                    // expenses), so a removed expense can't quietly come back into it either.
                    $expenseEvent = Event::withTrashed()->find($item->event_id);
                    if ($expenseEvent && $expenseEvent->hasEnded()) {
                        return response()->json([
                            'message' => 'This event has already ended, so its expenses can no longer be changed.',
                        ], 422);
                    }

                    $item->deleted_by = null;
                    $item->save();
                    $item->restore();
                    break;

                case 'age_bracket':
                    $item = AgeBracket::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->label;
                    $item->deleted_by = null;
                    $item->restore();
                    AgeBracket::forgetCache();
                    break;

                case 'civil_status':
                    $item = CivilStatus::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->label;
                    $item->deleted_by = null;
                    $item->restore();
                    CivilStatus::forgetCache();
                    break;

                case 'current_status':
                    $item = CurrentStatus::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->label;
                    $item->deleted_by = null;
                    $item->restore();
                    CurrentStatus::forgetCache();
                    break;

                case 'membership':
                    $item = Membership::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->restore();
                    $item->update(['is_active' => true, 'deactivated_at' => null]);
                    break;

                case 'notification':
                case 'event':
                    $item = Event::withTrashed()->findOrFail($request->id);
                    $itemName = $item->name;

                    if (!$item->trashed()) {
                        // Someone else restored it a moment ago: nothing to do,
                        // and nothing to log or notify a second time.
                        return response()->json(['message' => 'Item restored successfully']);
                    }

                    DB::beginTransaction();
                    try {
                        $item->deleted_by = null;
                        $item->save();

                        if ($item->trashed()) {
                            $item->restore();
                        }

                        $staffName       = 'Staff: ' . (auth()->user()->last_name ?? 'Unknown');
                        $restoredTitle   = 'Event Restored: ' . $item->name;
                        $restoredMessage = $staffName . ' • ' . $item->name . ' — ' .
                            ($item->notification_message ?? 'This event has been restored and is active again.');

                        $affectedNotifications = Notification::where('event_id', $item->id)
                            ->where('type', 'event_deleted')
                            ->update([
                                'type'                    => 'event_updated',
                                'title'                   => $restoredTitle,
                                'message'                 => $restoredMessage,
                                'is_updated'              => true,
                                'updated_at_notification' => now(),
                                'read'                    => false,
                                'updated_at'              => now(),
                            ]);

                        [$fbOk, $fbMessage] = app(\App\Services\FacebookService::class)->postEvent(
                            '✅ Event Re-opened: ' . $item->name,
                            //$staffName . ' • ' . $item->name . ' — This event has been re-opened and is active again. Please check the app for the updated schedule.'
                            'This event has been re-opened and is active again. Please check the app for the updated schedule.'
                        );
                        if (!$fbOk) {
                            \Illuminate\Support\Facades\Log::warning('Facebook reopen post failed: ' . $fbMessage, ['event' => $item->name]);
                        }

                        // Same SMS parity as FB: blast the re-opening to household heads.
                        try {
                            app(\App\Services\SmsService::class)->broadcastToAllHouseholdHeads(
                                $item->id,
                                'RE-OPENED: ' . $item->name . ' — This event has been re-opened. Check the app for the updated schedule.'
                            );
                        } catch (\Throwable $e) {
                            \Illuminate\Support\Facades\Log::warning('SMS reopen broadcast failed: ' . $e->getMessage(), ['event' => $item->name]);
                        }

                        DB::commit();

                        // ✅ Log the event restore
                        $this->createLog(
                            'Restore',
                            'Events',
                            "Restored event: '{$itemName}'"
                        );

                        // ✅ Log the notification update separately
                        $this->createLog(
                            'Update',
                            'Notifications',
                            "Restored notifications for event: '{$itemName}' — {$affectedNotifications} recipient(s) notified"
                        );

                        // ✅ Override the generic log below so we don't double-log
                        $itemName = '';

                    } catch (\Exception $e) {
                        DB::rollBack();
                        throw $e;
                    }
                    break;

                case 'resident':
                    $item = User::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->first_name . ' ' . $item->last_name;
                    $item->deleted_by = null;
                    $item->save();
                    $item->restore();
                    break;

                case 'household':
                    $item = Household::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->code;
                    // The household and the people it had come back together (those
                    // who are still free to be linked).
                    $relinked = \Illuminate\Support\Facades\DB::transaction(function () use ($item) {
                        $item->deleted_by = null;
                        $item->save();
                        $item->restore();

                        return $item->relinkDissolvedMembers();
                    });
                    $logExtra = $relinked['linked'] || $relinked['skipped']
                        ? " ({$relinked['linked']} member(s) linked back" . ($relinked['skipped'] ? ", {$relinked['skipped']} could not be" : '') . ')'
                        : '';
                    break;
            }

            // Events log their own (more detailed) entries above; every other kind is logged here.
            if ($itemName !== '') {
                $this->createLog(
                    'Restore',
                    'Archive',
                    "Restored {$request->type} '{$itemName}'" . ($logExtra ?? '')
                );
            }

            return response()->json(['message' => 'Item restored successfully'] + (isset($relinked) ? ['relinked' => $relinked['linked'], 'not_relinked' => $relinked['skipped']] : []));

        } catch (\Exception $e) {
            return response()->json(['message' => $this->safeError($e)], 500);
        }
    }

    public function forceDelete(Request $request)
    {
        // Permanent deletion is switched off for everyone, Head Staff included:
        // archived records are kept for transparency.
        return response()->json(['message' => 'Permanent deletion is disabled. Records are archived and kept.'], 403);

        // --- previous implementation, intentionally unreachable ---
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'type' => 'required|string|in:membership,event,resident,age_bracket,civil_status,current_status,inventory_item,expense,household',
            'id'   => 'required|integer',
        ]);

        try {
            $itemName = '';

            switch ($request->type) {

                case 'inventory_item':
                    $item = InventoryItem::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->forceDelete();
                    break;

                case 'expense':
                    $item = EventExpense::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->item;
                    $item->forceDelete();
                    break;

                case 'age_bracket':
                    $item = AgeBracket::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->label;
                    $item->forceDelete();
                    AgeBracket::forgetCache();
                    break;

                case 'civil_status':
                    $item = CivilStatus::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->label;
                    $item->forceDelete();
                    CivilStatus::forgetCache();
                    break;

                case 'current_status':
                    $item = CurrentStatus::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->label;
                    $item->forceDelete();
                    CurrentStatus::forgetCache();
                    break;

                case 'membership':
                    $item = Membership::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->forceDelete();
                    break;

                case 'event':
                    $item = Event::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->forceDelete();
                    break;

                case 'resident':
                    $item = User::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->first_name . ' ' . $item->last_name;
                    $item->forceDelete();
                    break;

                case 'household':
                    $item = Household::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->code;
                    $item->forceDelete();
                    break;
            }

            $this->createLog(
                'Force Delete',
                'Archive',
                "Deleted {$request->type} '{$itemName}'"
            );

            return response()->json(['message' => 'Item permanently deleted']);

        } catch (\Exception $e) {
            return response()->json(['message' => $this->safeError($e)], 500);
        }
    }
}

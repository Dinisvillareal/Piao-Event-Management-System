<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use App\Models\ActivityLog;
use App\Models\AgeBracket;
use App\Models\CivilStatus;
use App\Models\InventoryItem;
use App\Models\EventExpense;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ArchiveController extends Controller
{
    private function createLog($action, $module, $description)
    {
        ActivityLog::create([
            'user_code'   => auth()->user()?->user_code ?? 'SYSTEM',
            'action'      => $action,
            'module'      => $module,
            'description' => $description,
        ]);
    }

    public function index()
    {
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
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
                'deletedBy' => $item->recorded_by ?? 'SYSTEM',
            ]);

        $archivedItems = array_merge(
            $memberships->toArray(),
            $events->toArray(),
            $users->toArray(),
            $notifications->toArray(),
            $ageBrackets->toArray(),
            $civilStatuses->toArray(),
            $inventoryItems->toArray(),
            $expenses->toArray()
        );

        usort($archivedItems, function ($a, $b) {
            return strtotime($b['deletedAt']) <=> strtotime($a['deletedAt']);
        });

        return response()->json($archivedItems);
    }

    public function restore(Request $request)
    {
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'type' => 'required|string|in:membership,event,resident,notification,age_bracket,civil_status,inventory_item,expense',
            'id'   => 'required|integer',
        ]);

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
                    $item->restore();
                    break;
            }

            $this->createLog(
                'Restore',
                'Archive',
                "Restored {$request->type} '{$itemName}'"
            );

            return response()->json(['message' => 'Item restored successfully']);

        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function forceDelete(Request $request)
    {
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'type' => 'required|string|in:membership,event,resident,age_bracket,civil_status,inventory_item,expense',
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
            }

            $this->createLog(
                'Force Delete',
                'Archive',
                "Deleted {$request->type} '{$itemName}'"
            );

            return response()->json(['message' => 'Item permanently deleted']);

        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }
}

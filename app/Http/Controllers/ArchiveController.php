<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\Event;
use App\Models\User;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

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
                'id' => $item->id,
                'type' => 'membership',
                'name' => $item->name,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $events = Event::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id' => $item->id,
                'type' => 'event',
                'name' => $item->name,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $users = User::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(fn($item) => [
                'id' => $item->id,
                'type' => 'resident',
                'name' => $item->first_name . ' ' . $item->last_name,
                'deletedAt' => optional($item->deleted_at)->format('Y-m-d H:i:s'),
                'deletedBy' => $item->deleted_by ?? 'SYSTEM',
            ]);

        $archivedItems = array_merge(
            $memberships->toArray(),
            $events->toArray(),
            $users->toArray()
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
            'type' => 'required|string|in:membership,event,resident',
            'id' => 'required|integer',
        ]);

        try {

            $itemName = '';

            switch ($request->type) {

                case 'membership':
                    $item = Membership::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->restore();
                    $item->update(['is_active' => true, 'deactivated_at' => null]);
                    break;

                case 'event':
                    $item = Event::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->restore();
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
            'type' => 'required|string|in:membership,event,resident',
            'id' => 'required|integer',
        ]);

        try {

            $itemName = '';

            switch ($request->type) {

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

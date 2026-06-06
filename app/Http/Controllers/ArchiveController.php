<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\Event;
use App\Models\User;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ArchiveController extends Controller
{
    /**
     * Helper to create activity log
     */
    private function createLog($action, $module, $description)
    {
        ActivityLog::create([
            'user_code'   => auth()->user()?->user_code ?? 'SYSTEM',
            'action'      => $action,
            'module'      => $module,
            'description' => $description,
        ]);
    }

    /**
     * Get all archived (soft deleted) items from all tables
     */
    public function index()
    {
        // Only Staff can view archive
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $archivedItems = [];

        // 1. Archived Memberships
        $memberships = Membership::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'type' => 'membership',
                    'name' => $item->name,
                    'deletedAt' => $item->deleted_at ? $item->deleted_at->format('Y-m-d H:i:s') : null,
                    'deletedBy' => $item->deleted_by ?? 'System',
                ];
            });

        // 2. Archived Events
        $events = Event::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'type' => 'event',
                    'name' => $item->name,
                    'deletedAt' => $item->deleted_at ? $item->deleted_at->format('Y-m-d H:i:s') : null,
                    'deletedBy' => $item->deleted_by ?? 'System', 
                ];
            });

        // 3. Archived Users
        $users = User::onlyTrashed()
            ->orderBy('deleted_at', 'desc')
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'type' => 'user',
                    'name' => $item->first_name . ' ' . $item->last_name,
                    'deletedAt' => $item->deleted_at ? $item->deleted_at->format('Y-m-d H:i:s') : null,
                    'deletedBy' => 'System',
                ];
            });

        // Merge all collections
        $archivedItems = array_merge(
            $memberships->toArray(),
            $events->toArray(),
            $users->toArray()
        );

        // Sort by deletedAt descending (newest first)
        usort($archivedItems, function ($a, $b) {
            return strtotime($b['deletedAt']) - strtotime($a['deletedAt']);
        });

        return response()->json($archivedItems);
    }

    /**
     * Restore an archived item
     */
    public function restore(Request $request)
    {
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'type' => 'required|string|in:membership,event,user',
            'id' => 'required|integer',
        ]);

        try {
            $itemName = '';
            
            switch ($request->type) {
                case 'membership':
                    $item = Membership::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->restore();
                    
                    // Also reactivate the is_active flag
                    $item->update(['is_active' => true, 'deactivated_at' => null]);
                    
                    $this->createLog(
                        'Restore Membership',
                        'Archive',
                        "Restored membership '{$itemName}' from archive"
                    );
                    break;
                    
                case 'event':
                    $item = Event::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->restore();
                    
                    $this->createLog(
                        'Restore Event',
                        'Archive',
                        "Restored event '{$itemName}' from archive"
                    );
                    break;
                    
                case 'user':
                    $item = User::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->first_name . ' ' . $item->last_name;
                    $item->restore();
                    
                    $this->createLog(
                        'Restore User',
                        'Archive',
                        "Restored user '{$itemName}' from archive"
                    );
                    break;
                    
                default:
                    return response()->json(['message' => 'Invalid type'], 400);
            }

            return response()->json(['message' => 'Item restored successfully']);
            
        } catch (\Exception $e) {
            $this->createLog(
                'Restore Failed',
                'Archive',
                "Failed to restore {$request->type} ID {$request->id}: " . $e->getMessage()
            );
            
            return response()->json(['message' => 'Restore failed: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Permanently delete an archived item
     */
    public function forceDelete(Request $request)
    {
        if (auth()->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'type' => 'required|string|in:membership,event,user',
            'id' => 'required|integer',
        ]);

        try {
            $itemName = '';
            
            switch ($request->type) {
                case 'membership':
                    $item = Membership::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->forceDelete();
                    
                    $this->createLog(
                        'Permanent Delete',
                        'Archive',
                        "Permanently deleted membership '{$itemName}' from archive"
                    );
                    break;
                    
                case 'event':
                    $item = Event::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->name;
                    $item->forceDelete();
                    
                    $this->createLog(
                        'Permanent Delete',
                        'Archive',
                        "Permanently deleted event '{$itemName}' from archive"
                    );
                    break;
                    
                case 'user':
                    $item = User::onlyTrashed()->findOrFail($request->id);
                    $itemName = $item->first_name . ' ' . $item->last_name;
                    $item->forceDelete();
                    
                    $this->createLog(
                        'Permanent Delete',
                        'Archive',
                        "Permanently deleted user '{$itemName}' from archive"
                    );
                    break;
                    
                default:
                    return response()->json(['message' => 'Invalid type'], 400);
            }

            return response()->json(['message' => 'Item permanently deleted']);
            
        } catch (\Exception $e) {
            $this->createLog(
                'Permanent Delete Failed',
                'Archive',
                "Failed to permanently delete {$request->type} ID {$request->id}: " . $e->getMessage()
            );
            
            return response()->json(['message' => 'Delete failed: ' . $e->getMessage()], 500);
        }
    }
}
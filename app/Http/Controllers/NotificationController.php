<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\Membership;
use App\Models\SmsLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    // For Residents - their own notifications with event data
    public function index()
    {
        $notifications = Notification::where('user_id', Auth::id())
            ->with('event')  // Load event relationship
            ->orderBy('read', 'asc')
            ->orderBy('is_updated', 'desc')
            ->orderBy('updated_at_notification', 'desc')
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($notifications);
    }

    // For Staff - grouped by event (one notification per event)
    public function staffNotifications(Request $request)
    {
        if (Auth::user()->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        
        // Get the latest notification ID per event
        $latestIds = Notification::selectRaw('MAX(id) as id')
            ->whereNotNull('event_id')
            ->groupBy('event_id')
            ->pluck('id');
        
        $query = Notification::with('event')
            ->whereIn('id', $latestIds);
        
        // Filter by date - based on EVENT start date
        if ($request->has('date_filter') && $request->date_filter !== 'all') {
            $now = now();
            if ($request->date_filter === 'upcoming') {
                $query->whereHas('event', function($q) use ($now) {
                    $q->where('event_start', '>', $now);
                });
            } elseif ($request->date_filter === 'past') {
                $query->whereHas('event', function($q) use ($now) {
                    $q->where('event_start', '<', $now);
                });
            }
        }
        
        // Filter by target membership
        if ($request->has('target_membership_id') && $request->target_membership_id !== 'all-residents') {
            $targetId = (int) $request->target_membership_id;
            $query->whereHas('event', function($q) use ($targetId) {
                $q->whereJsonContains('membership_ids', $targetId);
            });
        }
        
        $notifications = $query->orderBy('created_at', 'desc')
            ->paginate(20);
        
        // Get all membership IDs from events
        $allMembershipIds = [];
        foreach ($notifications as $notification) {
            if ($notification->event && !empty($notification->event->membership_ids)) {
                $allMembershipIds = array_merge($allMembershipIds, $notification->event->membership_ids);
            }
        }
        
        // Batch load memberships
        $memberships = Membership::whereIn('id', array_unique($allMembershipIds))->get()->keyBy('id');
        
        foreach ($notifications as $notification) {
            if ($notification->event) {
                // Get recipient count
                $notification->recipient_count = Notification::where('event_id', $notification->event_id)->count();
                
                // Get target name
                $membershipIds = $notification->event->membership_ids ?? [];
                if (empty($membershipIds)) {
                    $notification->target_name = 'All Residents';
                    $notification->target_membership_id = null;
                } else {
                    $membership = $memberships->get($membershipIds[0]);
                    $notification->target_name = $membership ? $membership->name . ' Members' : 'Unknown';
                    $notification->target_membership_id = $membershipIds[0] ?? null;
                }
            } else {
                $notification->recipient_count = 1;
                $notification->target_name = 'Unknown';
            }
        }
        
        return response()->json($notifications);
    }

    public function thisWeek()
    {
        $notifications = Notification::where('user_id', Auth::id())
            ->where('created_at', '>=', now()->startOfWeek())
            ->where('created_at', '<=', now()->endOfWeek())
            ->with('event')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($notifications);
    }

    public function unreadCount()
    {
        $count = Notification::where('user_id', Auth::id())
            ->where('read', false)
            ->count();

        return response()->json(['count' => $count]);
    }

    public function markAsRead($id)
    {
        $notification = Notification::where('user_id', Auth::id())
            ->where('id', $id)
            ->firstOrFail();

        $notification->update(['read' => true]);

        return response()->json(['message' => 'Marked as read']);
    }

    public function markAllAsRead()
    {
        Notification::where('user_id', Auth::id())
            ->where('read', false)
            ->update(['read' => true]);

        return response()->json(['message' => 'All notifications marked as read']);
    }

    /**
     * Adviser recommendation: "Notify by household — head of household —
     * SMS contact number per household". Staff-facing log of what was
     * actually sent (or simulated) via App\Services\SmsService, so the
     * in-app notification list has a visible SMS counterpart.
     */
    public function smsLogs(Request $request)
    {
        if (Auth::user()->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = SmsLog::with(['user:id,first_name,last_name,household_code,is_household_head', 'event:id,name'])
            ->latest();

        if ($request->filled('event_id')) {
            $query->where('event_id', $request->event_id);
        }

        return response()->json($query->paginate((int) $request->get('per_page', 20)));
    }
}
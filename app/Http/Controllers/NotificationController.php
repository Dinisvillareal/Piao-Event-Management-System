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
    // Staff-only alerts (a member sent feedback) -- kept out of every resident-facing list.
    private const STAFF_ALERT = 'feedback_received';

    // For Residents - their own notifications with event data
    public function index(Request $request)
    {
        // Paginated, unread first. Callers that show the full list ask for more per page
        // (capped); anything that only needs a number should use /notifications/unread-count.
        $perPage = max(1, min(200, (int) $request->query('per_page', 20)));

        $notifications = Notification::where('user_id', Auth::id())
            ->where('type', '!=', self::STAFF_ALERT)
            ->with('event')  // Load event relationship
            ->orderBy('read', 'asc')
            ->orderBy('is_updated', 'desc')
            ->orderBy('updated_at_notification', 'desc')
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        return response()->json($notifications);
    }

    // For Staff - grouped by event (one notification per event)
    public function staffNotifications(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        
        // Get the latest notification ID per event
        $latestIds = Notification::selectRaw('MAX(id) as id')
            ->whereNotIn('type', [self::STAFF_ALERT, 'feedback_reply'])
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
                $notification->recipient_count = Notification::where('event_id', $notification->event_id)->whereNotIn('type', [self::STAFF_ALERT, 'feedback_reply'])->count();
                
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
            ->where('type', '!=', self::STAFF_ALERT)
            ->where('created_at', '>=', now()->startOfWeek())
            ->where('created_at', '<=', now()->endOfWeek())
            ->with('event')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($notifications);
    }

    private function replyAlertRow(Notification $n): array
    {
        $isFeedback = $n->type === 'feedback_reply';
        $isLike = $isFeedback && str_contains((string) $n->title, 'liked');
        $lines = preg_split('/\r?\n/', (string) $n->message, 2);

        return [
            'id' => $n->id,
            'event_id' => $n->event_id,
            'event_name' => $n->event->name ?? null,
            // like / reply = staff response to feedback; event = any other announcement.
            'kind' => !$isFeedback ? 'event' : ($isLike ? 'like' : 'reply'),
            'title' => $n->title,
            'text' => !$isFeedback ? trim((string) $n->message) : null,
            // "feedback" = their rating, "response" = their reason for not attending.
            'target' => str_contains((string) $n->title, 'response') ? 'response' : 'feedback',
            'preview' => !$isLike && isset($lines[1]) ? trim($lines[1]) : null,
            'read' => (bool) $n->read,
            'stamp' => $n->id . ':' . ($n->updated_at_notification ?? ''),
            'created_at' => $n->created_at,
        ];
    }

    /**
     * A member's feedback inbox: hearts and replies from staff on their own
     * ratings / reasons. Polled a few seconds apart; ?after_id= returns what
     * arrived since, so the page can pop a toast and chime once per item.
     */
    public function replyAlerts(Request $request)
    {
        // Everything addressed to this member (announcements, updates, staff
        // replies) so one poll drives the toast + chime; the unread count is
        // for staff replies only (it feeds the Events badge).
        $base = Notification::where('user_id', Auth::id())->where('type', '!=', self::STAFF_ALERT);
        $afterId = (int) $request->query('after_id', 0);
        $since = $request->filled('since') ? (string) $request->query('since') : null;

        return response()->json([
            'unread_count' => (clone $base)->where('type', 'feedback_reply')->where('read', false)->count(),
            'latest_id' => (int) ((clone $base)->max('id') ?? 0),
            // Brand-new rows, plus unread ones an update touched since the last poll
            // (an edited event re-uses its notification instead of adding a new one).
            'new' => !$request->boolean('init')
                ? (clone $base)->with('event:id,name')
                    ->where(function ($q) use ($afterId, $since) {
                        $q->where('id', '>', $afterId);
                        if ($since) {
                            $q->orWhere(fn ($u) => $u->where('read', false)->where('updated_at_notification', '>', $since));
                        }
                    })
                    ->orderBy('id')->limit(10)->get()
                    ->map(fn ($n) => $this->replyAlertRow($n))->values()
                : [],
            'server_time' => now()->toDateTimeString(),
        ]);
    }

    // Opening the Events page counts as seeing them.
    public function markReplyAlertsRead()
    {
        Notification::where('user_id', Auth::id())->where('type', 'feedback_reply')->where('read', false)->update(['read' => true]);

        return response()->json(['message' => 'ok']);
    }

    public function unreadCount()
    {
        $count = Notification::where('user_id', Auth::id())
            ->where('type', '!=', self::STAFF_ALERT)
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
            ->where('type', '!=', self::STAFF_ALERT)
            ->where('read', false)
            ->update(['read' => true]);

        return response()->json(['message' => 'All notifications marked as read']);
    }

    private function alertRow(Notification $n): array
    {
        $replyLike = str_contains((string) $n->title, 'liked your reply on their ');
        preg_match('/(\d)\/5/', $replyLike ? '' : (string) $n->message, $m);
        $lines = preg_split('/\r?\n/', (string) $n->message, 2);
        $isAbsence = str_ends_with((string) $n->title, 'for not attending') || str_ends_with((string) $n->title, 'their response');

        return [
            'id' => $n->id,
            'event_id' => $n->event_id,
            'event_name' => $n->event->name ?? null,
            'title' => $n->title,
            'rating' => isset($m[1]) ? (int) $m[1] : null,
            'reply_like' => $replyLike,
            // Which tab of the event's Feedback this belongs to.
            'kind' => $isAbsence ? 'absence' : 'rating',
            'absence_reason' => !$replyLike && str_ends_with((string) $n->title, 'for not attending')
                ? trim((string) preg_replace('/^.*? - /', '', $lines[0] ?? ''))
                : null,
            'comment' => isset($lines[1]) && trim($lines[1]) !== '' ? trim($lines[1]) : null,
            'read' => (bool) $n->read,
            'created_at' => $n->created_at,
        ];
    }

    /**
     * Staff bell feed: the newest feedback alerts for the signed-in staff
     * user, the unread total, and the highest id -- the bell polls this a few
     * seconds apart and passes ?after_id= to learn what arrived since.
     */
    public function staffAlerts(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $base = Notification::where('user_id', Auth::id())->where('type', self::STAFF_ALERT);

        $items = (clone $base)->with('event:id,name')->orderByDesc('id')->limit(30)->get();
        $afterId = (int) $request->query('after_id', 0);

        return response()->json([
            'unread_count' => (clone $base)->where('read', false)->count(),
            // Security alerts (staff changes, resets, lockouts...) ride on the same poll.
            'security_unread' => \App\Models\SecurityAlert::where('user_id', Auth::id())->where('read', false)->count(),
            'latest_id' => (int) ((clone $base)->max('id') ?? 0),
            // The bell only lists what still needs attention: unread, newest first.
            'data' => (clone $base)->with('event:id,name')->where('read', false)->orderByDesc('id')->limit(10)->get()
                ->map(fn ($n) => $this->alertRow($n))->values(),
            'new' => $afterId > 0
                ? $items->filter(fn ($n) => $n->id > $afterId)->map(fn ($n) => $this->alertRow($n))->values()
                : [],
        ]);
    }

    /**
     * Full, filterable history for the Notifications page's Feedback tab.
     * Filters: search (member, event or comment), rating 1-5, unread only.
     */
    public function staffAlertsAll(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = Notification::where('user_id', Auth::id())->where('type', self::STAFF_ALERT)->with('event:id,name');

        // Ratings and "couldn't attend" reasons are listed separately.
        $absenceLike = '%for not attending';
        $absenceReplyLike = '%reply on their response';
        $isAbsenceQ = fn ($q) => $q->where('title', 'like', $absenceLike)->orWhere('title', 'like', $absenceReplyLike);
        $counts = [
            'rating' => (clone $query)->whereNot($isAbsenceQ)->count(),
            'absence' => (clone $query)->where($isAbsenceQ)->count(),
        ];
        if ($request->query('kind') === 'absence') {
            $query->where($isAbsenceQ);
        } elseif ($request->query('kind') === 'rating') {
            $query->whereNot($isAbsenceQ);
        }

        if ($request->boolean('unread')) {
            $query->where('read', false);
        }
        if ($request->filled('rating') && (int) $request->rating >= 1 && (int) $request->rating <= 5) {
            $query->where('message', 'like', '% - ' . (int) $request->rating . '/5%');
        }
        if ($request->filled('search')) {
            $term = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $request->search)) . '%';
            $query->where(fn ($q) => $q->where('title', 'like', $term)->orWhere('message', 'like', $term));
        }

        $perPage = max(1, min(50, (int) $request->query('per_page', 10)));
        $page = $query->orderByDesc('id')->paginate($perPage);

        return response()->json([
            'data' => collect($page->items())->map(fn ($n) => $this->alertRow($n))->values(),
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'total' => $page->total(),
            'counts' => $counts,
        ]);
    }

    public function markStaffAlertRead($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        Notification::where('user_id', Auth::id())->where('type', self::STAFF_ALERT)->where('id', $id)->update(['read' => true]);

        return response()->json(['message' => 'Marked as read']);
    }

    public function markAllStaffAlertsRead()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        Notification::where('user_id', Auth::id())->where('type', self::STAFF_ALERT)->where('read', false)->update(['read' => true]);

        return response()->json(['message' => 'All marked as read']);
    }

    /**
     * Adviser recommendation: "Notify by household — head of household —
     * SMS contact number per household". Staff-facing log of what was
     * actually sent (or simulated) via App\Services\SmsService, so the
     * in-app notification list has a visible SMS counterpart.
     */
    public function smsLogs(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = SmsLog::with(['user:id,first_name,last_name,is_household_head', 'event:id,name'])
            ->latest();

        if ($request->filled('event_id')) {
            $query->where('event_id', $request->event_id);
        }

        // Status filter: only the three values the SMS service ever writes.
        if (in_array($request->get('status'), ['sent', 'failed', 'simulated'], true)) {
            $query->where('status', $request->get('status'));
        }

        // Search by resident name, mobile number or event name. LIKE wildcards
        // typed by the user are escaped so they match literally.
        $term = trim((string) $request->get('search', ''));
        if ($term !== '') {
            $like = '%' . addcslashes(mb_substr($term, 0, 100), '\\%_') . '%';
            $query->where(function ($q) use ($like) {
                $q->where('to_number', 'like', $like)
                  ->orWhereHas('user', function ($u) use ($like) {
                      $u->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like]);
                  })
                  ->orWhereHas('event', fn ($e) => $e->where('name', 'like', $like));
            });
        }

        $perPage = max(1, min(50, (int) $request->get('per_page', 20)));

        return response()->json($query->paginate($perPage));
    }
}
<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Event;
use App\Models\Membership;
use App\Models\User;

/**
 * The staff Dashboard's headline numbers, worked out on the server in one request.
 *
 * Before this, the page added them up in the browser from endpoints made for other screens, which
 * gave wrong totals: /users includes archived accounts, "Staff Actions Today" was the size of one
 * 20-row page of the activity log, and "Events Today" skipped events that had already started.
 */
class DashboardController extends Controller
{
    public function stats()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $now = now();
        $dayStart = $now->copy()->startOfDay();
        $dayEnd = $dayStart->copy()->addDay();

        // Same people the Residents page lists (residents and staff), minus archived accounts.
        $residents = User::whereIn('role', ['Resident', 'Staff'])->count();

        $memberships = Membership::withoutTrashed()->where('is_active', true)->count();

        $events = Event::withoutTrashed()->count();

        // Happening today: starts before tomorrow and has not ended before today began --
        // so an event that started at 7:00 and is still on at 9:00 is counted.
        $eventsToday = Event::withoutTrashed()
            ->where('event_start', '<', $dayEnd->toDateTimeString())
            ->whereRaw('COALESCE(event_end, event_start) >= ?', [$dayStart->toDateTimeString()])
            ->count();

        $today = ActivityLog::query()->filtered(['date' => $dayStart->toDateString()]);
        $actionsToday = (clone $today)->count();
        $activeStaffToday = (clone $today)->whereNotNull('user_code')->distinct()->count('user_code');
        $last = (clone $today)->orderBy('created_at', 'desc')->orderBy('id', 'desc')->first(['action', 'user_code', 'created_at']);

        return response()->json([
            'residents' => $residents,
            'memberships' => $memberships,
            'events' => $events,
            'events_today' => $eventsToday,
            'actions_today' => $actionsToday,
            'active_staff_today' => $activeStaffToday,
            'last_action' => $last ? [
                'action' => $last->action,
                'user_code' => $last->user_code,
                'created_at' => $last->created_at,
            ] : null,
        ]);
    }
}

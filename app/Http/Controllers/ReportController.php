<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\EventAttendance;
use App\Models\EventExpense;
use App\Models\Feedback;
use App\Models\InventoryItem;
use App\Models\Membership;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    private function isStaff()
    {
        return auth()->user()?->role === 'Staff';
    }

    /**
     * Adviser recommendation: "Filtering (First) Data Analytics — Date,
     * Summary — Attendance, Percentage" + "What Events usually happen per
     * year / attendees" + "Profiling (Filter for Age)".
     *
     * Also fulfils UC-10 (Generate Printable Reports) — the frontend Reports
     * view renders this as charts/cards and offers a print button.
     *
     * Query params: date_from, date_to, membership_id, age_group
     */
    public function attendanceSummary(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $dateFrom = $request->filled('date_from') ? $request->date_from : null;
        $dateTo = $request->filled('date_to') ? $request->date_to : null;
        $membershipId = $request->filled('membership_id') ? (int) $request->membership_id : null;
        $ageGroup = $request->filled('age_group') ? strtolower($request->age_group) : null;

        $eventsQuery = Event::withoutTrashed();
        if ($dateFrom) $eventsQuery->whereDate('event_start', '>=', $dateFrom);
        if ($dateTo) $eventsQuery->whereDate('event_start', '<=', $dateTo);
        if ($membershipId) $eventsQuery->whereJsonContains('membership_ids', $membershipId);

        $events = $eventsQuery->orderBy('event_start')->get();
        $eventIds = $events->pluck('id');

        $ageRanges = [
            'child' => [0, 12],
            'youth' => [13, 17],
            'adult' => [18, 59],
            'senior' => [60, 150],
        ];

        $attendanceQuery = EventAttendance::whereIn('event_id', $eventIds)->with('user');
        if ($ageGroup && isset($ageRanges[$ageGroup])) {
            [$min, $max] = $ageRanges[$ageGroup];
            $attendanceQuery->whereHas('user', function ($q) use ($min, $max) {
                $q->whereNotNull('birth_date')
                    ->whereRaw('TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) BETWEEN ? AND ?', [$min, $max]);
            });
        }
        $attendances = $attendanceQuery->get();

        $totalEligible = 0;
        foreach ($events as $event) {
            $totalEligible += $event->attendances()->count();
        }

        $attendedCount = $attendances->filter(fn ($a) => $a->time_in)->count();
        $percentage = $totalEligible > 0 ? round(($attendedCount / $totalEligible) * 100, 1) : 0;

        $perEvent = $events->map(function ($event) use ($attendances) {
            $eventAttendances = $attendances->where('event_id', $event->id);
            $eligible = $event->attendances()->count();
            $attended = $eventAttendances->filter(fn ($a) => $a->time_in)->count();

            return [
                'id' => $event->id,
                'name' => $event->name,
                'date' => optional($event->event_start)->format('Y-m-d'),
                'eligible' => $eligible,
                'attended' => $attended,
                'percentage' => $eligible > 0 ? round(($attended / $eligible) * 100, 1) : 0,
                'approved_budget' => $event->approved_budget,
                'total_expenses' => $event->total_expenses,
                'average_rating' => $event->average_rating,
            ];
        })->values();

        // "What Events usually happen per year" — event count grouped by month across all years present
        $perMonth = $events->groupBy(fn ($e) => optional($e->event_start)->format('Y-m'))
            ->map(fn ($group, $key) => ['month' => $key, 'events' => $group->count()])
            ->sortKeys()
            ->values();

        $ageBreakdown = collect($ageRanges)->map(function ($range, $label) use ($eventIds) {
            [$min, $max] = $range;
            $count = EventAttendance::whereIn('event_id', $eventIds)
                ->whereNotNull('time_in')
                ->whereHas('user', function ($q) use ($min, $max) {
                    $q->whereNotNull('birth_date')
                        ->whereRaw('TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) BETWEEN ? AND ?', [$min, $max]);
                })->count();

            return ['group' => ucfirst($label), 'attended' => $count];
        })->values();

        $avgRating = Feedback::whereIn('event_id', $eventIds)->avg('rating');

        return response()->json([
            'filters' => [
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'membership_id' => $membershipId,
                'age_group' => $ageGroup,
            ],
            'summary' => [
                'total_events' => $events->count(),
                'total_eligible' => $totalEligible,
                'total_attended' => $attendedCount,
                'attendance_percentage' => $percentage,
                'average_feedback_rating' => $avgRating !== null ? round((float) $avgRating, 1) : null,
            ],
            'per_event' => $perEvent,
            'per_month' => $perMonth,
            'age_breakdown' => $ageBreakdown,
        ]);
    }

    /**
     * UC-10 report type "membership" — how many residents belong to each
     * membership, plus each membership's eligibility rules (age bracket /
     * civil status / gender), so staff can see enrollment at a glance.
     *
     * Query params: membership_id (optional, narrows to a single membership)
     */
    public function membershipSummary(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $membershipId = $request->filled('membership_id') ? (int) $request->membership_id : null;

        $query = Membership::withoutTrashed()
            ->where('is_active', true)
            ->with(['eligibleAgeBracket', 'eligibleCivilStatus'])
            ->withCount('users');

        if ($membershipId) {
            $query->where('id', $membershipId);
        }

        $memberships = $query->orderBy('name')->get();

        $perMembership = $memberships->map(function ($m) {
            return [
                'id' => $m->id,
                'name' => $m->name,
                'member_count' => $m->users_count,
                'eligible_age_bracket' => $m->eligibleAgeBracket?->label,
                'eligible_civil_status' => $m->eligibleCivilStatus?->label,
                'eligible_gender' => $m->eligible_gender,
            ];
        })->values();

        return response()->json([
            'summary' => [
                'total_memberships' => $memberships->count(),
                'total_assignments' => $memberships->sum('users_count'),
            ],
            'per_membership' => $perMembership,
        ]);
    }

    /**
     * UC-10 report type "budget" — approved budget vs. actual expenses per
     * event, so staff can see which events are over budget at a glance.
     *
     * Query params: date_from, date_to (filters by the event's start date)
     */
    public function budgetSummary(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $dateFrom = $request->filled('date_from') ? $request->date_from : null;
        $dateTo = $request->filled('date_to') ? $request->date_to : null;

        $eventsQuery = Event::withoutTrashed()->whereNotNull('approved_budget');
        if ($dateFrom) $eventsQuery->whereDate('event_start', '>=', $dateFrom);
        if ($dateTo) $eventsQuery->whereDate('event_start', '<=', $dateTo);

        $events = $eventsQuery->orderBy('event_start')->get();

        $perEvent = $events->map(function ($event) {
            $approved = (float) $event->approved_budget;
            $spent = (float) $event->total_expenses;

            return [
                'id' => $event->id,
                'name' => $event->name,
                'date' => optional($event->event_start)->format('Y-m-d'),
                'approved_budget' => $approved,
                'total_expenses' => $spent,
                'remaining' => round($approved - $spent, 2),
                'is_over_budget' => $spent > $approved,
            ];
        })->values();

        $eventIds = $events->pluck('id');
        $topExpenses = EventExpense::whereIn('event_id', $eventIds)
            ->orderByDesc('amount')
            ->limit(10)
            ->get(['event_id', 'item', 'amount'])
            ->map(fn ($e) => [
                'event_name' => optional($events->firstWhere('id', $e->event_id))->name,
                'item' => $e->item,
                'amount' => (float) $e->amount,
            ])
            ->values();

        return response()->json([
            'summary' => [
                'total_events' => $events->count(),
                'total_approved_budget' => round($events->sum('approved_budget'), 2),
                'total_expenses' => round($perEvent->sum('total_expenses'), 2),
                'total_remaining' => round($perEvent->sum('remaining'), 2),
                'events_over_budget' => $perEvent->where('is_over_budget', true)->count(),
            ],
            'per_event' => $perEvent,
            'top_expenses' => $topExpenses,
        ]);
    }

    /**
     * UC-10 report type "inventory" — barangay asset counts grouped by
     * condition, plus the full item list for the printable report.
     *
     * Query params: condition (optional, narrows to one condition)
     */
    public function inventorySummary(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $condition = $request->filled('condition') ? $request->condition : null;

        $query = InventoryItem::query();
        if ($condition) $query->where('condition', $condition);

        $items = $query->orderBy('name')->get();

        $byCondition = $items->groupBy('condition')
            ->map(fn ($group, $label) => ['condition' => $label, 'count' => $group->count(), 'quantity' => $group->sum('quantity')])
            ->values();

        return response()->json([
            'summary' => [
                'total_items' => $items->count(),
                'total_quantity' => $items->sum('quantity'),
            ],
            'by_condition' => $byCondition,
            'items' => $items->map(fn ($i) => [
                'id' => $i->id,
                'name' => $i->name,
                'quantity' => $i->quantity,
                'condition' => $i->condition,
                'storage_location' => $i->storage_location,
            ])->values(),
        ]);
    }
}

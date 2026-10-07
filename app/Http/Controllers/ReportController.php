<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\EventAttendance;
use App\Models\EventExpense;
use App\Models\Feedback;
use App\Models\InventoryItem;
use App\Models\Membership;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpWord\Settings as PhpWordSettings;

class ReportController extends Controller
{
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

        return response()->json($this->buildAttendanceData($request));
    }

    /**
     * Data-only version of attendanceSummary() -- extracted so the JSON
     * endpoint above (used by the on-screen Reports view) and the Word/PDF
     * export endpoints below (see exportPdf/exportWord) share exactly one
     * source of truth for "what an attendance report contains" instead of
     * two copies of the same query logic drifting apart over time.
     */
    private function buildAttendanceData(Request $request): array
    {
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

        // Optional attendee lists (the "Event Attendance Records" section):
        // only built when asked for, and only for the requested events, so
        // the on-screen summary stays light.
        $includeAttendees = $request->boolean('include_attendees');
        $eventIdFilter = $this->parseIdList($request->input('event_ids'));
        $attendeeFilter = in_array($request->input('attendee_filter'), ['present', 'absent'], true)
            ? $request->input('attendee_filter')
            : 'all';

        $perEvent = $events->map(function ($event) use ($attendances, $includeAttendees, $eventIdFilter, $attendeeFilter) {
            $eventAttendances = $attendances->where('event_id', $event->id);
            $eligible = $event->attendances()->count();
            $attended = $eventAttendances->filter(fn ($a) => $a->time_in)->count();
            $status = $this->eventStatusLabel($event);

            $row = [
                'id' => $event->id,
                'name' => $event->name,
                'date' => optional($event->event_start)->format('Y-m-d'),
                'start_time' => optional($event->event_start)->format('g:i A'),
                'end_time' => optional($event->event_end)->format('g:i A'),
                'location' => $event->location,
                'description' => $event->description,
                'status' => $status,
                'memberships' => $event->memberships->pluck('name')->values(),
                'eligible' => $eligible,
                'attended' => $attended,
                'absent' => max(0, $eligible - $attended),
                'percentage' => $eligible > 0 ? round(($attended / $eligible) * 100, 1) : 0,
                'approved_budget' => $event->approved_budget,
                'total_expenses' => $event->total_expenses,
                'average_rating' => $event->average_rating,
            ];

            if ($includeAttendees && ($eventIdFilter === null || in_array($event->id, $eventIdFilter, true))) {
                $row['attendees'] = $eventAttendances
                    ->filter(function ($a) use ($attendeeFilter) {
                        if ($attendeeFilter === 'present') return (bool) $a->time_in;
                        if ($attendeeFilter === 'absent') return !$a->time_in;
                        return true;
                    })
                    ->sortBy(fn ($a) => mb_strtolower(($a->user->last_name ?? '') . ' ' . ($a->user->first_name ?? '')))
                    ->values()
                    ->map(function ($a) use ($status) {
                        $u = $a->user;
                        $middle = $u && $u->middle_name ? ' ' . mb_substr($u->middle_name, 0, 1) . '.' : '';

                        return [
                            'id' => $a->id,
                            'user_code' => $u->user_code ?? null,
                            'name' => $u ? trim(($u->last_name ?? '') . ', ' . ($u->first_name ?? '') . $middle) : '—',
                            'age' => $u->age ?? null,
                            'age_group' => $u->age_group ?? null,
                            'gender' => $u->gender ?? null,
                            'contact_number' => $u->contact_number ?? null,
                            'attendance' => $a->time_in ? 'Present' : ($status === 'Upcoming' ? 'Expected' : 'Absent'),
                            'time_in' => $a->time_in ? \Carbon\Carbon::parse($a->time_in)->format('g:i A') : null,
                            'time_out' => $a->time_out ? \Carbon\Carbon::parse($a->time_out)->format('g:i A') : null,
                        ];
                    })
                    ->all();
            }

            return $row;
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

        return [
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
        ];
    }

    /** Upcoming / Ongoing / Past -- same rule the Events page and Budget page use. */
    private function eventStatusLabel(Event $event): string
    {
        $now = now();
        $start = $event->event_start;
        if (!$start) {
            return 'Upcoming';
        }
        $end = $event->event_end ?? $event->call_time_end ?? $start->copy()->endOfDay();
        if ($now->lt($start)) return 'Upcoming';
        if ($now->gt($end)) return 'Past';
        return 'Ongoing';
    }

    /** "1,2,3" or [1,2,3] -> [1,2,3]; null when nothing was sent. */
    private function parseIdList($value): ?array
    {
        if ($value === null || $value === '' || $value === []) {
            return null;
        }
        $list = is_array($value) ? $value : explode(',', (string) $value);
        $ids = array_values(array_unique(array_filter(array_map('intval', $list))));

        return $ids ?: null;
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

        return response()->json($this->buildMembershipData($request));
    }

    private function buildMembershipData(Request $request): array
    {
        $membershipId = $request->filled('membership_id') ? (int) $request->membership_id : null;

        $query = Membership::withoutTrashed()
            ->where('is_active', true)
            ->with(['eligibleAgeBracket', 'eligibleCivilStatus', 'eligibleCurrentStatus'])
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
                'eligible_current_status' => $m->eligibleCurrentStatus?->label,
                'eligible_gender' => $m->eligible_gender,
            ];
        })->values();

        return [
            'summary' => [
                'total_memberships' => $memberships->count(),
                'total_assignments' => $memberships->sum('users_count'),
            ],
            'per_membership' => $perMembership,
        ];
    }

    /**
     * UC-10 report type "budget" — approved budget vs. actual expenses per
     * event, so staff can see which events are over budget at a glance.
     *
     * Query params: date_from, date_to (filters by the event's start date),
     * event_id (narrows to a single event -- takes priority over the date
     * range, since picking one specific event answers a different question
     * than picking a range)
     */
    public function budgetSummary(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json($this->buildBudgetData($request));
    }

    private function buildBudgetData(Request $request): array
    {
        $dateFrom = $request->filled('date_from') ? $request->date_from : null;
        $dateTo = $request->filled('date_to') ? $request->date_to : null;
        $eventId = $request->filled('event_id') ? (int) $request->event_id : null;

        $eventsQuery = Event::withoutTrashed();
        if ($eventId) {
            $eventsQuery->where('id', $eventId);
        } else {
            if ($dateFrom) $eventsQuery->whereDate('event_start', '>=', $dateFrom);
            if ($dateTo) $eventsQuery->whereDate('event_start', '<=', $dateTo);
        }

        $allEvents = $eventsQuery->orderBy('event_start')->get();
        $events = $allEvents->filter(fn ($e) => $e->approved_budget !== null)->values();
        $unbudgetedEvents = $allEvents->filter(fn ($e) => $e->approved_budget === null)->values();
        $eventIds = $allEvents->pluck('id');

        // Every expense entry for these events, grouped by event, with the
        // recorder's name resolved from their user code.
        $expenseRows = EventExpense::whereIn('event_id', $eventIds)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->groupBy('event_id');
        $codes = $expenseRows->flatten(1)->pluck('recorded_by')->filter()->unique()->values();
        $people = \App\Models\User::whereIn('user_code', $codes)->get(['user_code', 'first_name', 'last_name'])->keyBy('user_code');
        $expensesFor = function ($event) use ($expenseRows, $people) {
            return ($expenseRows->get($event->id) ?? collect())->map(function ($x) use ($people) {
                $who = $x->recorded_by ? $people->get($x->recorded_by) : null;

                return [
                    'item' => $x->item,
                    'amount' => (float) $x->amount,
                    'notes' => $x->notes,
                    'recorded_by' => $who ? trim($who->first_name . ' ' . $who->last_name) : ($x->recorded_by ?: null),
                    'date' => optional($x->created_at)->format('Y-m-d'),
                ];
            })->values()->all();
        };

        $perEvent = $events->map(function ($event) use ($expensesFor) {
            $approved = (float) $event->approved_budget;
            $spent = (float) $event->total_expenses;
            $utilization = $approved > 0 ? round(($spent / $approved) * 100, 1) : ($spent > 0 ? 100.0 : 0.0);
            $expenses = $expensesFor($event);

            return [
                'id' => $event->id,
                'name' => $event->name,
                'date' => optional($event->event_start)->format('Y-m-d'),
                'event_status' => $this->eventStatusLabel($event),
                'approved_budget' => $approved,
                'total_expenses' => $spent,
                'remaining' => round($approved - $spent, 2),
                'over_by' => round(max(0, $spent - $approved), 2),
                'utilization' => $utilization,
                'is_over_budget' => $spent > $approved,
                'budget_status' => $spent > $approved ? 'Over budget' : ($utilization >= 90 ? 'Near limit' : 'Within budget'),
                'expense_count' => count($expenses),
                'expenses' => $expenses,
            ];
        })->values();

        $overBudget = $perEvent->where('is_over_budget', true)->sortByDesc('over_by')->values();

        $unbudgeted = $unbudgetedEvents->map(function ($event) use ($expensesFor) {
            $expenses = $expensesFor($event);

            return [
                'id' => $event->id,
                'name' => $event->name,
                'date' => optional($event->event_start)->format('Y-m-d'),
                'event_status' => $this->eventStatusLabel($event),
                'total_expenses' => round((float) $event->total_expenses, 2),
                'expense_count' => count($expenses),
                'expenses' => $expenses,
            ];
        })->values();

        $topExpenses = EventExpense::whereIn('event_id', $eventIds)
            ->orderByDesc('amount')
            ->limit(10)
            ->get(['event_id', 'item', 'amount'])
            ->map(fn ($e) => [
                'event_name' => optional($allEvents->firstWhere('id', $e->event_id))->name,
                'item' => $e->item,
                'amount' => (float) $e->amount,
            ])
            ->values();

        $totalApproved = round($events->sum('approved_budget'), 2);
        $totalSpent = round($perEvent->sum('total_expenses'), 2);

        return [
            'summary' => [
                'total_events' => $events->count(),
                'total_approved_budget' => $totalApproved,
                'total_expenses' => $totalSpent,
                'total_remaining' => round($perEvent->sum('remaining'), 2),
                'events_over_budget' => $overBudget->count(),
                'total_over_amount' => round($overBudget->sum('over_by'), 2),
                'events_near_limit' => $perEvent->where('budget_status', 'Near limit')->count(),
                'utilization_percentage' => $totalApproved > 0 ? round(($totalSpent / $totalApproved) * 100, 1) : 0,
                'total_expense_entries' => $perEvent->sum('expense_count') + $unbudgeted->sum('expense_count'),
                'events_without_budget' => $unbudgeted->count(),
                'unbudgeted_spent' => round($unbudgeted->sum('total_expenses'), 2),
            ],
            'per_event' => $perEvent,
            'over_budget' => $overBudget,
            'unbudgeted' => $unbudgeted,
            'top_expenses' => $topExpenses,
        ];
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

        return response()->json($this->buildInventoryData($request));
    }

    private function buildInventoryData(Request $request): array
    {
        $condition = $request->filled('condition') ? $request->condition : null;

        $query = InventoryItem::query();
        if ($condition) \App\Http\Controllers\InventoryController::applyConditionFilter($query, $condition);

        $items = $query->orderBy('name')->get();

        $byCondition = $items->groupBy('condition')
            ->map(fn ($group, $label) => ['condition' => $label, 'count' => $group->count(), 'quantity' => $group->sum('quantity')])
            ->values();

        return [
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
        ];
    }

    /**
     * UC-10 / official-record downloads (Word + PDF).
     *
     * Deliberately independent of the frontend's language switcher: an
     * official printed/exported barangay record must always read in
     * English no matter which language a staff member currently has the
     * on-screen UI set to -- other screens (like the Dashboard) are free to
     * stay translated, but these two endpoints never touch that system at
     * all. Every label below is a plain hardcoded English string.
     */
    public function exportPdf(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $payload = $this->buildExportPayload($request);

        $pdf = Pdf::loadView('reports.export', $payload)->setPaper('a4', 'portrait');

        // "Page X of Y" the same way a browser's own print dialog stamps
        // one on -- dompdf only fills in {PAGE_NUM}/{PAGE_COUNT} through
        // this canvas call (the plain text placeholder in the Blade view
        // is never substituted on its own), so the page has to already be
        // rendered before this runs, and Pdf::download()/output() below
        // are written to skip re-rendering once that's done.
        $pdf->render();
        $canvas = $pdf->getCanvas();
        $fontMetrics = $pdf->getFontMetrics();
        $font = $fontMetrics->getFont('DejaVu Sans');
        $footerSize = 8;
        // Bottom-right, right edge lined up with the page's right margin
        // (12mm, the same @page margin as export.blade.php and the browser
        // print view). The text is right-aligned by measuring a same-width
        // stand-in ("Page 00 of 12") because dompdf only substitutes the
        // real numbers at draw time; digits are the same width in DejaVu
        // Sans, so the stand-in is exact for every page of a given count.
        $pageCount = (string) $canvas->get_page_count();
        $footerWidth = $fontMetrics->getTextWidth(
            'Page ' . str_repeat('0', strlen($pageCount)) . ' of ' . $pageCount,
            $font,
            $footerSize
        );
        $canvas->page_text(
            $canvas->get_width() - (12 * 72 / 25.4) - $footerWidth,
            $canvas->get_height() - 34,
            'Page {PAGE_NUM} of {PAGE_COUNT}',
            $font,
            $footerSize,
            [0.55, 0.6, 0.6]
        );

        return $pdf->download(Str::slug($payload['reportTitle']) . '.pdf');
    }

    public function exportWord(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // PhpWord defaults to PHP's native `ZipArchive` class to write the
        // .docx (a .docx *is* a zip archive) -- on a PHP build without the
        // `zip` extension enabled (common on a fresh Windows/XAMPP/Laragon
        // install) that throws "Class ZipArchive not found" the moment
        // save() runs. PhpWord actually ships its own pure-PHP zip writer
        // (PCLZip) for exactly this case; switching to it here means this
        // export works regardless of whether the server's PHP build has the
        // zip extension compiled in, with no php.ini change or restart
        // needed.
        PhpWordSettings::setZipClass(PhpWordSettings::PCLZIP);

        // PhpWord does NOT escape text by default, so any "&", "<" or ">" in an
        // event name, expense note, resident name, etc. (e.g. "Chairs & Tables")
        // wrote invalid XML into the .docx and Word refused to open the file
        // ("Word experienced an error trying to open the file"). Turn escaping
        // on so every string is written as safe XML.
        PhpWordSettings::setOutputEscapingEnabled(true);

        $payload = $this->buildExportPayload($request);
        $phpWord = $this->buildWordDocument($payload);

        $fileName = Str::slug($payload['reportTitle']) . '.docx';
        $tempPath = tempnam(sys_get_temp_dir(), 'piao_report_');
        $phpWord->save($tempPath, 'Word2007');

        return response()->download($tempPath, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ])->deleteFileAfterSend(true);
    }

    /**
     * Shared data + English-only copy for both export formats -- mirrors
     * what ReportsView.tsx's own printFilterSummary computes for the
     * on-screen letterhead, just hardcoded to English since there is no
     * language switcher on this code path.
     */
    private function buildExportPayload(Request $request): array
    {
        $type = in_array($request->query('type'), ['attendance', 'membership', 'budget', 'inventory'], true)
            ? $request->query('type')
            : 'attendance';

        $titles = [
            'attendance' => 'Attendance Summary Report',
            'membership' => 'Membership Summary Report',
            'budget' => 'Budget Summary Report',
            'inventory' => 'Inventory Summary Report',
        ];

        // Which sections to include (print/export options). null = everything (except the long attendee lists, which are opt-in).
        $allowed = [
            'attendance' => ['summary', 'charts', 'age', 'events', 'records'],
            'membership' => ['summary', 'memberships'],
            'budget' => ['summary', 'overBudget', 'perEvent', 'expenses', 'topExpenses', 'noBudget'],
            'inventory' => ['summary', 'condition', 'items'],
        ][$type];
        $sections = null;
        if ($request->filled('sections')) {
            $picked = is_array($request->query('sections')) ? $request->query('sections') : explode(',', (string) $request->query('sections'));
            $sections = array_values(array_intersect($allowed, array_map('trim', $picked)));
        }

        // The attendee lists only exist when that section was explicitly picked.
        if ($type === 'attendance' && is_array($sections) && in_array('records', $sections, true)) {
            $request->merge(['include_attendees' => 1]);
        }

        $data = match ($type) {
            'membership' => $this->buildMembershipData($request),
            'budget' => $this->buildBudgetData($request),
            'inventory' => $this->buildInventoryData($request),
            default => $this->buildAttendanceData($request),
        };

        return [
            'type' => $type,
            'sections' => $sections,
            'reportTitle' => $titles[$type],
            'filterSummary' => $this->buildFilterSummaryLine($type, $request),
            'printedOn' => now()->format('F j, Y'),
            'data' => $data,
        ];
    }

    private function buildFilterSummaryLine(string $type, Request $request): string
    {
        if ($type === 'budget' && $request->filled('event_id')) {
            $event = Event::find((int) $request->event_id);
            return $event ? "Event: {$event->name}" : 'Period: All Dates';
        }

        if ($type === 'attendance' || $type === 'budget') {
            $from = $request->filled('date_from') ? $request->date_from : null;
            $to = $request->filled('date_to') ? $request->date_to : null;
            if ($from || $to) {
                return 'Period: ' . ($from ?: 'Start') . ' – ' . ($to ?: 'Present');
            }
            return 'Period: All Dates';
        }

        if ($type === 'membership') {
            if ($request->filled('membership_id')) {
                $m = Membership::find((int) $request->membership_id);
                return $m ? "Membership: {$m->name}" : 'All Memberships';
            }
            return 'All Memberships';
        }

        // inventory
        return $request->filled('condition') ? "Condition: {$request->condition}" : 'All Conditions';
    }

    /**
     * Builds the .docx equivalent of resources/views/reports/export.blade.php
     * (the PDF / print layout): same A4 page and margins, same letterhead
     * (seal + address left, system name and date right, heavy teal rule, title
     * row), same colored stat tiles, same framed chart cards, same two-up
     * record cards, same ruled tables, and the same signature + footer. Charts
     * and progress meters are drawn as small PNGs (GD) so they look like the
     * PDF's; on a PHP build without GD they fall back to shaded table cells.
     */
    private function buildWordDocument(array $payload): PhpWord
    {
        $phpWord = new PhpWord();
        $phpWord->setDefaultFontName('Calibri');
        $phpWord->setDefaultFontSize(10);
        $phpWord->setDefaultParagraphStyle(['spaceAfter' => 40, 'spaceBefore' => 0]);
        $phpWord->getDocInfo()->setTitle($payload['reportTitle'])->setCreator('Piao Connect')->setCompany('Barangay Piao');

        $W = self::WORD_WIDTH;
        $section = $phpWord->addSection([
            'pageSizeW' => 11906, 'pageSizeH' => 16838, 'orientation' => 'portrait',
            'marginLeft' => 680, 'marginRight' => 680, 'marginTop' => 794, 'marginBottom' => 1000,
            'footerHeight' => 420,
        ]);

        $this->addWordFooter($phpWord, $section);
        $this->addLetterhead($section, $payload);

        $data = $payload['data'];
        $sections = $payload['sections'] ?? null;
        $show = fn (string $key) => $sections === null || in_array($key, $sections, true);
        $showRecords = is_array($sections) && in_array('records', $sections, true);

        switch ($payload['type']) {
            case 'attendance':
                $s = $data['summary'];
                if ($show('summary')) {
                    $this->addStatTiles($section, [
                        [(string) $s['total_events'], 'Events in Range', '456F68'],
                        [(string) $s['total_attended'], 'Attendance Records', 'C6953C'],
                        [$s['attendance_percentage'] . '%', 'Attendance Rate', '2A423E'],
                        [$s['average_feedback_rating'] !== null ? (string) $s['average_feedback_rating'] : '—', 'Avg Feedback Rating', '8A3D2C'],
                    ]);
                }

                // "Events per Month" (2/3) and "Overall Attendance" (1/3) side by side, like the PDF.
                if ($show('charts')) {
                    $this->addCardRow($section, [
                        [66, function ($cell, $inner) use ($data) {
                            $this->addCardHeading($cell, 'Events per Month', 'What events usually happen, and when — across all years in range.');
                            $this->addVerticalBarChart($cell, $data['per_month'], 'events', 'month', '4FBEB0', $inner);
                        }],
                        [34, function ($cell, $inner) use ($s) {
                            $this->addCardHeading($cell, 'Overall Attendance');
                            $this->addProgressSummary($cell, (float) $s['attendance_percentage'], $s['total_attended'] . ' of ' . $s['total_eligible'] . ' eligible residents', '4FBEB0', $inner);
                        }],
                    ]);
                }

                if ($show('age')) {
                    $this->addCardRow($section, [[100, function ($cell, $inner) use ($data) {
                        $this->addCardHeading($cell, 'Attendance by Age Group', 'Adviser recommendation: resident profiling filtered by age.');
                        $this->addVerticalBarChart($cell, $data['age_breakdown'], 'attended', 'group', 'E8B84A', $inner);
                    }]]);
                }

                if ($show('events')) {
                    $this->addPagedCardGrid($section, 'Per-Event Breakdown', null, $data['per_event'], function ($c, $ev, $in) {
                        $c->addText($ev['name'], ['bold' => true, 'size' => 9.5, 'color' => '005F63'], ['spaceAfter' => 0]);
                        $c->addText($ev['date'] ?? '—', ['size' => 7.5, 'color' => '999999'], ['spaceAfter' => 30]);
                        $this->addMiniProgressBar($c, (float) $ev['percentage'], '4FBEB0', $in);
                        $c->addText($ev['attended'] . ' / ' . $ev['eligible'] . ' attended', ['size' => 8.5, 'color' => '667777'], ['spaceAfter' => 0]);
                        if ($ev['approved_budget'] !== null) {
                            $c->addText('Budget: ₱' . number_format($ev['approved_budget'], 2) . ' · Spent: ₱' . number_format($ev['total_expenses'], 2), ['size' => 8.5, 'color' => '667777'], ['spaceAfter' => 0]);
                        }
                    }, null, [1, 7]);
                }

                if ($showRecords) {
                    if (is_array($sections) && count(array_diff($sections, ['records'])) > 0) {
                        $section->addPageBreak();
                    }
                    $this->addSectionHeading($section, 'Event Attendance Records', 'Every event in the period with the residents who were eligible to attend and whether each one signed in.');
                    $events = collect($data['per_event'])->filter(fn ($e) => array_key_exists('attendees', $e))->values();
                    if ($events->isEmpty()) {
                        $this->addEmptyNote($section, 'No events to list for this period.');
                    }
                    foreach ($events as $ev) {
                        $meta = array_filter([
                            $ev['date'] ?? '—',
                            !empty($ev['start_time']) ? $ev['start_time'] . (!empty($ev['end_time']) ? ' – ' . $ev['end_time'] : '') : null,
                            $ev['location'] ?? null,
                            $ev['status'] ?? null,
                        ]);
                        $this->addRecordHead($section, $ev['name'], implode('  ·  ', $meta), [
                            ['Eligible: ', null], [(string) $ev['eligible'], ['bold' => true]], ['     Present: ', null],
                            [(string) $ev['attended'], ['bold' => true, 'color' => '047857']], ['     Absent: ', null],
                            [(string) $ev['absent'], ['bold' => true, 'color' => 'DC2626']], ['     Attendance rate: ', null],
                            [$ev['percentage'] . '%', ['bold' => true]],
                        ]);
                        if (count($ev['attendees']) === 0) {
                            $this->addEmptyNote($section, 'No attendees to list for this event.');
                            continue;
                        }
                        $rows = [];
                        foreach ($ev['attendees'] as $n => $a) {
                            $color = $a['attendance'] === 'Present' ? '047857' : ($a['attendance'] === 'Absent' ? 'DC2626' : '667777');
                            $rows[] = [
                                (string) ($n + 1), $a['name'], $a['user_code'] ?? '—', isset($a['age']) ? (string) $a['age'] : '—', $a['gender'] ?? '—',
                                ['t' => $a['attendance'], 'color' => $color, 'bold' => true], $a['time_in'] ?? '—', $a['time_out'] ?? '—',
                            ];
                        }
                        $this->addDataTable($section, ['#', 'Name', 'ID', 'Age', 'Gender', 'Status', 'Time In', 'Time Out'], [24, 230, 62, 30, 46, 54, 54, 54], $rows, ['size' => 8.5]);
                        $section->addTextBreak(1, ['size' => 6]);
                    }
                }
                break;

            case 'membership':
                $s = $data['summary'];
                if ($show('summary')) {
                    $this->addStatTiles($section, [
                        [(string) $s['total_memberships'], 'Total Memberships', '456F68'],
                        [(string) $s['total_assignments'], 'Total Enrolled Residents', 'C6953C'],
                    ]);
                }

                if ($show('memberships')) {
                    $this->addPagedCardGrid($section, 'Enrollment by Membership', null, $data['per_membership'], function ($c, $m, $in) {
                        $reqs = implode(' • ', array_filter([$m['eligible_age_bracket'] ?? null, $m['eligible_civil_status'] ?? null, $m['eligible_gender'] ?? null]));
                        $c->addText($m['name'], ['bold' => true, 'size' => 9.5, 'color' => '005F63'], ['spaceAfter' => 0]);
                        $c->addText((string) $m['member_count'], ['bold' => true, 'size' => 18, 'color' => '333333'], ['spaceAfter' => 0]);
                        $c->addText('members', ['size' => 7.5, 'color' => '999999'], ['spaceAfter' => 40]);
                        if ($reqs !== '') {
                            $c->addText(' Requires: ' . $reqs . ' ', ['size' => 8, 'bold' => true, 'color' => '0F766E', 'bgColor' => 'E6F5F3'], ['spaceAfter' => 0]);
                        }
                    }, null, [4, 7]);
                }
                break;

            case 'budget':
                $s = $data['summary'];
                $peso = fn ($n) => '₱' . number_format((float) $n, 2);

                if ($show('summary')) {
                    $this->addStatTiles($section, [
                        [$peso($s['total_approved_budget']), 'Total Approved Budget', '456F68'],
                        [$peso($s['total_expenses']), 'Total Expenses', 'C6953C'],
                        [$peso($s['total_remaining']), 'Remaining Budget', '2A423E'],
                        [(string) $s['events_over_budget'], 'Events Over Budget', '8A3D2C'],
                    ]);
                    $this->addStatTiles($section, [
                        [$s['utilization_percentage'] . '%', 'Budget Used', '3F6B66'],
                        [$peso($s['total_over_amount']), 'Total Over Budget', '9A4A38'],
                        [(string) $s['events_near_limit'], 'Events Near Limit (90%+)', '8C6A2B'],
                        [(string) $s['total_expense_entries'], 'Expense Entries', '33504B'],
                    ]);
                }

                if ($show('overBudget')) {
                    $this->addSectionHeading($section, 'Over-Budget Events', 'Events whose recorded expenses are higher than the approved budget, largest overspend first.');
                    if (empty($data['over_budget'])) {
                        $this->addEmptyNote($section, 'No events are over budget for this period.', '0F766E');
                    } else {
                        $rows = [];
                        foreach ($data['over_budget'] as $ev) {
                            $rows[] = [$ev['name'], $ev['date'] ?? '—', $peso($ev['approved_budget']), $peso($ev['total_expenses']), ['t' => $peso($ev['over_by']), 'color' => 'DC2626', 'bold' => true], $ev['utilization'] . '%'];
                        }
                        $this->addDataTable($section, ['Event', 'Date', 'Approved', 'Spent', 'Over By', 'Used'], [250, 80, 100, 100, 100, 55], $rows, [], [2, 3, 4, 5]);
                    }
                }

                if ($show('perEvent')) {
                    $this->addPagedCardGrid($section, 'Budget per Event', 'Approved budget, spending and how much of the budget has been used, for every event.', $data['per_event'], function ($c, $ev, $in) use ($peso) {
                        $c->addText($ev['name'], ['bold' => true, 'size' => 9.5, 'color' => '005F63'], ['spaceAfter' => 0]);
                        $c->addText(($ev['date'] ?? '—') . ' · ' . $ev['event_status'] . ' · ' . $ev['budget_status'], ['size' => 7.5, 'color' => '999999'], ['spaceAfter' => 30]);
                        $c->addText('Budget: ' . $peso($ev['approved_budget']) . ' · Spent: ' . $peso($ev['total_expenses']), ['size' => 8.5, 'color' => '667777'], ['spaceAfter' => 0]);
                        $c->addText($ev['utilization'] . '% used · ' . $ev['expense_count'] . ' ' . ($ev['expense_count'] === 1 ? 'entry' : 'entries'), ['size' => 8.5, 'color' => '667777'], ['spaceAfter' => 0]);
                        $c->addText(($ev['is_over_budget'] ? 'Over budget by ' : 'Remaining ') . $peso(abs($ev['remaining'])), ['bold' => true, 'size' => 8.5, 'color' => $ev['is_over_budget'] ? 'DC2626' : '0F766E'], ['spaceAfter' => 0]);
                    }, fn ($ev) => $ev['is_over_budget'] ? ['FEF2F2', 'FECACA'] : null, [3, 7]);
                }

                if ($show('expenses')) {
                    $withItems = collect($data['per_event'])->concat($data['unbudgeted'] ?? [])->filter(fn ($ev) => !empty($ev['expenses']))->values();
                    if ($withItems->isNotEmpty()) {
                        if (is_array($sections) && count(array_diff($sections, ['expenses'])) > 0) {
                            $section->addPageBreak();
                        }
                        $this->addSectionHeading($section, 'Itemized Expenses per Event', 'Every expense entry recorded against each event.');
                        foreach ($withItems as $ev) {
                            $hasBudget = array_key_exists('approved_budget', $ev);
                            $over = !empty($ev['is_over_budget']);
                            $stats = $hasBudget
                                ? [['Budget: ', null], [$peso($ev['approved_budget']), ['bold' => true]], ['     Spent: ', null], [$peso($ev['total_expenses']), ['bold' => true]], ['     ', null],
                                    $over ? ['Over by ' . $peso($ev['over_by']), ['bold' => true, 'color' => 'DC2626']] : ['Remaining: ' . $peso($ev['remaining']), ['bold' => true, 'color' => '0F766E']]]
                                : [['No approved budget', ['bold' => true]], ['     Spent: ', null], [$peso($ev['total_expenses']), ['bold' => true]]];
                            $this->addRecordHead($section, $ev['name'], ($ev['date'] ?? '—') . '  ·  ' . $ev['event_status'], $stats, $over);
                            $rows = [];
                            foreach ($ev['expenses'] as $i => $x) {
                                $rows[] = [(string) ($i + 1), $x['item'], $peso($x['amount']), $x['notes'] ?: '—', $x['recorded_by'] ?: '—', $x['date'] ?? '—'];
                            }
                            $this->addDataTable($section, ['#', 'Item', 'Amount', 'Notes', 'Recorded By', 'Date'], [22, 190, 80, 190, 100, 80], $rows, ['size' => 8.5], [2], ['', 'Total', $peso($ev['total_expenses']), '', '', '']);
                            $section->addTextBreak(1, ['size' => 6]);
                        }
                    }
                }

                if ($show('topExpenses') && !empty($data['top_expenses'])) {
                    $this->addSectionHeading($section, 'Top Expenses');
                    $rows = [];
                    foreach ($data['top_expenses'] as $ex) {
                        $rows[] = [$ex['item'], $ex['event_name'] ?? '—', $peso($ex['amount'])];
                    }
                    $this->addDataTable($section, ['Item', 'Event', 'Amount'], [300, 340, 100], $rows, [], [2]);
                }

                if ($show('noBudget') && !empty($data['unbudgeted'])) {
                    $this->addSectionHeading($section, 'Events Without an Approved Budget', 'Events in this period that have no approved budget set, so they are not counted in the totals above.');
                    $rows = [];
                    foreach ($data['unbudgeted'] as $ev) {
                        $rows[] = [$ev['name'], $ev['date'] ?? '—', $ev['event_status'], (string) $ev['expense_count'], $peso($ev['total_expenses'])];
                    }
                    $this->addDataTable($section, ['Event', 'Date', 'Status', 'Entries', 'Spent'], [300, 85, 70, 50, 100], $rows, [], [3, 4]);
                }
                break;

            default: // inventory
                $s = $data['summary'];
                if ($show('summary')) {
                    $this->addStatTiles($section, [
                        [(string) $s['total_items'], 'Total Inventory Items', '456F68'],
                        [(string) $s['total_quantity'], 'Total Quantity', 'C6953C'],
                    ]);
                }

                if ($show('condition')) {
                    $this->addCardRow($section, [[100, function ($cell, $inner) use ($data) {
                        $this->addCardHeading($cell, 'By Condition');
                        $run = $cell->addTextRun(['spaceAfter' => 0, 'spaceBefore' => 40]);
                        $any = false;
                        foreach ($data['by_condition'] as $c) {
                            $any = true;
                            [$bg, $fg] = $this->conditionColors($c['condition']);
                            $run->addText(' ' . $c['condition'] . ': ' . $c['count'] . ' items (' . $c['quantity'] . ' units) ', ['size' => 8.5, 'bold' => true, 'color' => $fg, 'bgColor' => $bg]);
                            $run->addText('   ', ['size' => 8.5]);
                        }
                        if (!$any) {
                            $this->addEmptyNote($cell, 'No items found.');
                        }
                    }]]);
                }

                if ($show('items')) {
                    $this->addPagedCardGrid($section, 'Inventory Items', null, $data['items'], function ($c, $item, $in) {
                        [$bg, $fg] = $this->conditionColors($item['condition']);
                        $c->addText($item['name'], ['bold' => true, 'size' => 9.5, 'color' => '005F63'], ['spaceAfter' => 0]);
                        $c->addText($item['storage_location'] ?? '—', ['size' => 7.5, 'color' => '999999'], ['spaceAfter' => 40]);
                        $run = $c->addTextRun(['spaceAfter' => 0, 'tabs' => [new \PhpOffice\PhpWord\Style\Tab('right', $in)]]);
                        $run->addText(' ' . $item['condition'] . ' ', ['size' => 8, 'bold' => true, 'color' => $fg, 'bgColor' => $bg]);
                        $run->addText("\t×" . $item['quantity'], ['size' => 10, 'bold' => true, 'color' => '005F63']);
                    }, null, [4, 9]);
                }
                break;
        }

        // Signature block + footer line -- kept together, like the PDF's .sig-wrap.
        $section->addTextBreak(1, ['size' => 14]);
        $sig = $section->addTable($this->noBorderTableStyle(['width' => $W, 'unit' => 'dxa', 'layout' => 'fixed']));
        $sig->addRow(560, ['cantSplit' => true, 'exactHeight' => false]);
        foreach ([4600, 1346, 4600] as $w) {
            $sig->addCell($w)->addText('', [], ['keepNext' => true, 'spaceAfter' => 0]);
        }
        $sig->addRow(null, ['cantSplit' => true]);
        $line = ['borderTopSize' => 6, 'borderTopColor' => '667777'];
        $sig->addCell(4600, $line)->addText('Prepared by', ['size' => 9.5, 'color' => '444444'], ['alignment' => 'center', 'keepNext' => true]);
        $sig->addCell(1346)->addText('', [], ['spaceAfter' => 0]);
        $sig->addCell(4600, $line)->addText('Barangay Captain', ['size' => 9.5, 'color' => '444444'], ['alignment' => 'center', 'keepNext' => true]);
        $section->addText(
            'Generated via Piao Connect — Barangay Information Management System · ' . $payload['printedOn'],
            ['size' => 7.5, 'color' => '999999'],
            ['alignment' => 'center', 'spaceBefore' => 160]
        );

        return $phpWord;
    }

    /** Usable page width in twips: A4 (11906) minus 2 x 680 side margins. */
    private const WORD_WIDTH = 10546;

    /** Style for a purely structural table: real (white) borders so Word never shows its editing grid. */
    private function noBorderTableStyle(array $extra = []): array
    {
        return array_merge([
            'borderSize' => 2, 'borderColor' => 'FFFFFF',
            'borderInsideHSize' => 2, 'borderInsideHColor' => 'FFFFFF',
            'borderInsideVSize' => 2, 'borderInsideVColor' => 'FFFFFF',
        ], $extra);
    }

    /** Border + fill for a framed card cell (the PDF's .card / .mini-cell). */
    private function frameStyle(string $border = 'DDD5CA', string $bg = 'FFFFFF'): array
    {
        return [
            'bgColor' => $bg,
            'borderTopSize' => 6, 'borderTopColor' => $border,
            'borderBottomSize' => 6, 'borderBottomColor' => $border,
            'borderLeftSize' => 6, 'borderLeftColor' => $border,
            'borderRightSize' => 6, 'borderRightColor' => $border,
        ];
    }

    /** Letterhead: seal + address on the left, system name + date on the right, heavy teal rule, title row. */
    private function addLetterhead($section, array $payload): void
    {
        $W = self::WORD_WIDTH;
        $muted = ['size' => 8.5, 'color' => '667777'];
        $tight = ['spaceAfter' => 0, 'spaceBefore' => 0];

        $head = $section->addTable($this->noBorderTableStyle(['width' => $W, 'unit' => 'dxa', 'layout' => 'fixed']));
        $head->addRow(null, ['cantSplit' => true]);

        $logoCell = $head->addCell(1400, ['valign' => 'center']);
        $logoPath = public_path('logo-removebg-preview.png');
        if (is_file($logoPath)) {
            $logoCell->addImage($logoPath, ['width' => 62, 'height' => 62]);
        }

        $text = $head->addCell($W - 1400 - 2300, ['valign' => 'center']);
        $text->addText('REPUBLIC OF THE PHILIPPINES', ['size' => 7.5, 'color' => '667777', 'spacing' => 20], $tight);
        $text->addText('Province of Zamboanga del Norte · Municipality of President Manuel A. Roxas', $muted, ['spaceAfter' => 20]);
        $text->addText('BARANGAY PIAO', ['bold' => true, 'size' => 20, 'color' => '005F63'], ['spaceAfter' => 20]);
        $text->addText('Piao Barangay Hall, Purok Uno, Barangay Piao, 7102', $muted, $tight);

        $right = $head->addCell(2300, ['valign' => 'top']);
        $right->addText('PIAO CONNECT', ['bold' => true, 'size' => 9.5, 'color' => '4FBEB0', 'spacing' => 30], ['alignment' => 'right', 'spaceAfter' => 80]);
        $right->addText('Generated on', $muted, ['alignment' => 'right', 'spaceAfter' => 0]);
        $right->addText($payload['printedOn'], ['bold' => true, 'size' => 9, 'color' => '005F63'], ['alignment' => 'right', 'spaceAfter' => 0]);

        // Heavy teal rule (3pt).
        $section->addText('', ['size' => 2], ['spaceAfter' => 80, 'borderBottomSize' => 24, 'borderBottomColor' => '005F63']);

        $title = $section->addTable($this->noBorderTableStyle(['width' => $W, 'unit' => 'dxa', 'layout' => 'fixed']));
        $title->addRow(null, ['cantSplit' => true]);
        $title->addCell(6300, ['valign' => 'bottom'])->addText(strtoupper($payload['reportTitle']), ['bold' => true, 'size' => 15, 'color' => '005F63'], $tight);
        $title->addCell($W - 6300, ['valign' => 'bottom'])->addText($payload['filterSummary'], $muted, ['alignment' => 'right', 'spaceAfter' => 20]);

        // Thin rule + breathing room.
        $section->addText('', ['size' => 2], ['spaceAfter' => 120, 'borderBottomSize' => 6, 'borderBottomColor' => 'DDD5CA']);
    }

    /** Footer: system line on the left, "Page X of Y" (real Word fields) on the right, hairline above. */
    private function addWordFooter(PhpWord $phpWord, $section): void
    {
        $footer = $section->addFooter();
        // A paragraph style that carries the font itself: the PAGE / NUMPAGES field results inherit it
        // (a per-run font on the field code alone is ignored by some viewers, which then show the digits larger).
        $phpWord->addFontStyle('ReportFooterRight', ['size' => 8, 'color' => '999999'], ['alignment' => 'right', 'spaceBefore' => 40, 'spaceAfter' => 0]);
        $table = $footer->addTable($this->noBorderTableStyle(['width' => self::WORD_WIDTH, 'unit' => 'dxa', 'layout' => 'fixed']));
        $table->addRow(null, ['cantSplit' => true]);
        $rule = ['borderTopSize' => 6, 'borderTopColor' => 'DDD5CA'];
        $font = ['size' => 8, 'color' => '999999'];
        $table->addCell(7600, $rule)->addText('Barangay Piao · Piao Connect — Barangay Information Management System', $font, ['spaceBefore' => 40, 'spaceAfter' => 0]);
        $run = $table->addCell(self::WORD_WIDTH - 7600, $rule)->addTextRun('ReportFooterRight');
        $run->addText('Page ', $font);
        $run->addField('PAGE', [], [], null, $font);
        $run->addText(' of ', $font);
        $run->addField('NUMPAGES', [], [], null, $font);
    }

    /** Colored stat tiles in one row -- the PDF's .stat-box strip. */
    private function addStatTiles($section, array $tiles): void
    {
        $gap = 90;
        $n = max(1, count($tiles));
        $w = (int) floor((self::WORD_WIDTH - ($n - 1) * $gap) / $n);
        $table = $section->addTable($this->noBorderTableStyle([
            'width' => self::WORD_WIDTH, 'unit' => 'dxa', 'layout' => 'fixed',
            'cellMarginTop' => 120, 'cellMarginBottom' => 110, 'cellMarginLeft' => 160, 'cellMarginRight' => 100,
        ]));
        $table->addRow(null, ['cantSplit' => true]);
        foreach ($tiles as $i => [$value, $label, $color]) {
            if ($i > 0) {
                $table->addCell($gap)->addText('', ['size' => 2], ['spaceAfter' => 0]);
            }
            $cell = $table->addCell($w, ['bgColor' => $color]);
            $cell->addText($value, ['bold' => true, 'size' => 19, 'color' => 'FFFFFF'], ['spaceAfter' => 10]);
            $cell->addText(strtoupper($label), ['bold' => true, 'size' => 7.5, 'color' => 'FFFFFF', 'spacing' => 10], ['spaceAfter' => 0]);
        }
        $section->addTextBreak(1, ['size' => 5]);
    }

    /** One row of framed cards side by side (weights in %); each callback gets (cell, innerWidthTwips). */
    private function addCardRow($section, array $cards, bool $allowSplit = false): void
    {
        $gap = 110;
        $margin = 150;
        $n = count($cards);
        $total = array_sum(array_column($cards, 0));
        $avail = self::WORD_WIDTH - ($n - 1) * $gap;
        $table = $section->addTable($this->noBorderTableStyle([
            'width' => self::WORD_WIDTH, 'unit' => 'dxa', 'layout' => 'fixed',
            'cellMarginTop' => 130, 'cellMarginBottom' => 130, 'cellMarginLeft' => $margin, 'cellMarginRight' => $margin,
        ]));
        $table->addRow(null, ['cantSplit' => !$allowSplit]);
        foreach ($cards as $i => [$weight, $fill]) {
            if ($i > 0) {
                $table->addCell($gap)->addText('', ['size' => 2], ['spaceAfter' => 0]);
            }
            $w = (int) floor($avail * $weight / $total);
            $cell = $table->addCell($w, $this->frameStyle());
            $fill($cell, $w - 2 * $margin);
        }
        $section->addTextBreak(1, ['size' => 5]);
    }

    private function addCardHeading($container, string $title, ?string $desc = null): void
    {
        $container->addText($title, ['bold' => true, 'size' => 12, 'color' => '005F63'], ['spaceAfter' => $desc === null ? 60 : 0, 'keepNext' => true]);
        if ($desc !== null) {
            $container->addText($desc, ['size' => 8, 'color' => '8A8F8F'], ['spaceAfter' => 80, 'keepNext' => true]);
        }
    }

    /** Heading for a section whose content is a flat table (no frame). */
    private function addSectionHeading($section, string $title, ?string $desc = null): void
    {
        $section->addText($title, ['bold' => true, 'size' => 13, 'color' => '005F63'], ['spaceBefore' => 160, 'spaceAfter' => $desc === null ? 80 : 0, 'keepNext' => true]);
        if ($desc !== null) {
            $section->addText($desc, ['size' => 8, 'color' => '8A8F8F'], ['spaceAfter' => 100, 'keepNext' => true]);
        }
    }

    private function addEmptyNote($container, string $text, string $color = 'AAAAAA'): void
    {
        $container->addText($text, ['italic' => true, 'size' => 9, 'color' => $color], ['spaceBefore' => 40, 'spaceAfter' => 100]);
    }

    /** Tinted event banner above a table (the PDF's .rec-head). $statRuns: [[text, fontOrNull], ...]. */
    private function addRecordHead($section, string $name, string $meta, array $statRuns, bool $warn = false): void
    {
        $table = $section->addTable($this->noBorderTableStyle([
            'width' => self::WORD_WIDTH, 'unit' => 'dxa', 'layout' => 'fixed',
            'cellMarginTop' => 90, 'cellMarginBottom' => 90, 'cellMarginLeft' => 150, 'cellMarginRight' => 150,
        ]));
        $table->addRow(null, ['cantSplit' => true]);
        $cell = $table->addCell(self::WORD_WIDTH, $warn ? $this->frameStyle('FECACA', 'FEF2F2') : $this->frameStyle('DCEAE5', 'EEF4F1'));
        $keep = ['keepNext' => true, 'spaceAfter' => 0];
        $cell->addText($name, ['bold' => true, 'size' => 11, 'color' => '005F63'], $keep);
        $cell->addText($meta, ['size' => 8.5, 'color' => '667777'], $keep);
        $run = $cell->addTextRun(['keepNext' => true, 'spaceAfter' => 0, 'spaceBefore' => 20]);
        foreach ($statRuns as [$text, $font]) {
            $run->addText($text, array_merge(['size' => 9, 'color' => '333333'], $font ?? []));
        }
        // A paragraph between the two tables: without it Word/LibreOffice fuse them into one table,
        // which also stops the data table's header row from repeating on later pages.
        $section->addText('', ['size' => 1], ['spaceAfter' => 0, 'spaceBefore' => 0, 'keepNext' => true]);
    }

    /**
     * Ruled table with the report's teal header row (repeats on every page),
     * zebra striping and optional right-aligned columns / total row.
     * $weights are relative column widths scaled to the page width; a cell
     * value is a string or ['t' => text, 'color' => hex, 'bold' => bool].
     */
    private function addDataTable($section, array $headers, array $weights, array $rows, array $opts = [], array $rightCols = [], ?array $totalRow = null): void
    {
        $size = $opts['size'] ?? 9;
        $sum = array_sum($weights);
        $widths = array_map(fn ($w) => (int) floor(self::WORD_WIDTH * $w / $sum), $weights);
        $table = $section->addTable([
            'width' => self::WORD_WIDTH, 'unit' => 'dxa', 'layout' => 'fixed',
            'borderSize' => 4, 'borderColor' => 'D6DEDB',
            'borderInsideHSize' => 4, 'borderInsideHColor' => 'D6DEDB',
            'borderInsideVSize' => 4, 'borderInsideVColor' => 'D6DEDB',
            'cellMarginTop' => 55, 'cellMarginBottom' => 55, 'cellMarginLeft' => 90, 'cellMarginRight' => 90,
        ]);
        $align = fn ($i) => in_array($i, $rightCols, true) ? ['alignment' => 'right', 'spaceAfter' => 0] : ['spaceAfter' => 0];

        $table->addRow(null, ['cantSplit' => true, 'tblHeader' => true]);
        foreach ($headers as $i => $h) {
            $table->addCell($widths[$i], ['bgColor' => '005F63'])
                ->addText($h, ['bold' => true, 'color' => 'FFFFFF', 'size' => $size], $align($i));
        }
        foreach ($rows as $r => $row) {
            $table->addRow(null, ['cantSplit' => true]);
            $bg = $r % 2 === 1 ? ['bgColor' => 'F5F9F8'] : [];
            foreach ($row as $i => $val) {
                $font = ['size' => $size, 'color' => '222222'];
                if (is_array($val)) {
                    $font = array_merge($font, array_filter(['color' => $val['color'] ?? null, 'bold' => $val['bold'] ?? null]));
                    $val = $val['t'];
                }
                $table->addCell($widths[$i], $bg)->addText((string) $val, $font, $align($i));
            }
        }
        if ($totalRow) {
            $table->addRow(null, ['cantSplit' => true]);
            foreach ($totalRow as $i => $val) {
                $table->addCell($widths[$i], ['bgColor' => 'EEF4F1'])->addText((string) $val, ['bold' => true, 'size' => $size], $align($i));
            }
        }
    }

    /**
     * Two-up grid of mini cards (the PDF's .mini-grid) built as one table with
     * spacer column/rows. $fillCell receives (cell, item, innerWidthTwips);
     * $styleFor may return [bg, border] for a highlighted card.
     */
    private function addCardGrid($container, $items, callable $fillCell, ?callable $styleFor = null, ?int $availWidth = null): void
    {
        $items = collect($items)->values();
        if ($items->isEmpty()) {
            $this->addEmptyNote($container, 'No records found.');

            return;
        }

        $availWidth ??= self::WORD_WIDTH;
        $gap = 110;
        $margin = 130;
        $cw = (int) floor(($availWidth - $gap) / 2);
        $table = $container->addTable($this->noBorderTableStyle([
            'width' => $cw * 2 + $gap, 'unit' => 'dxa', 'layout' => 'fixed',
            'cellMarginTop' => 100, 'cellMarginBottom' => 100, 'cellMarginLeft' => $margin, 'cellMarginRight' => $margin,
        ]));
        $rows = $items->chunk(2);
        foreach ($rows as $ri => $pair) {
            if ($ri > 0) {
                $table->addRow(90, ['exactHeight' => true, 'cantSplit' => true]);
                foreach ([$cw, $gap, $cw] as $w) {
                    $table->addCell($w)->addText('', ['size' => 2], ['spaceAfter' => 0]);
                }
            }
            $table->addRow(null, ['cantSplit' => true]);
            foreach ([0, 1] as $col) {
                if ($col === 1) {
                    $table->addCell($gap)->addText('', ['size' => 2], ['spaceAfter' => 0]);
                }
                $item = $pair[$col] ?? null;
                if ($item === null) {
                    $table->addCell($cw)->addText('', ['size' => 2], ['spaceAfter' => 0]);
                    continue;
                }
                [$bg, $border] = ($styleFor ? $styleFor($item) : null) ?? ['FAFAF7', 'EEE2D3'];
                $fillCell($table->addCell($cw, $this->frameStyle($border, $bg)), $item, $cw - 2 * $margin);
            }
        }
    }

    /**
     * Record-list card split into page-sized cards ("(continued)" heading), like
     * the PDF -- $caps = [rows that fit on the page the list starts on, rows per
     * later page], one row being a 2-up pair.
     */
    private function addPagedCardGrid($section, string $title, ?string $desc, $items, callable $fill, ?callable $styleFor, array $caps): void
    {
        $list = array_values(collect($items)->all());
        if ($list === []) {
            $this->addCardRow($section, [[100, function ($cell) use ($title, $desc) {
                $this->addCardHeading($cell, $title, $desc);
                $this->addEmptyNote($cell, 'No records found.');
            }]]);

            return;
        }

        $rows = array_chunk($list, 2);
        $i = 0;
        $cap = max(1, $caps[0]);
        $group = 0;
        while ($i < count($rows)) {
            $chunk = array_merge(...array_slice($rows, $i, $cap));
            $heading = $group > 0 ? $title . ' (continued)' : $title;
            $this->addCardRow($section, [[100, function ($cell, $inner) use ($heading, $desc, $group, $chunk, $fill, $styleFor) {
                $this->addCardHeading($cell, $heading, $group === 0 ? $desc : null);
                $this->addCardGrid($cell, $chunk, $fill, $styleFor, $inner);
            }]]);
            $i += $cap;
            $cap = max(1, $caps[1]);
            $group++;
        }
    }

    /** Vertical bar chart: value row, one PNG for all the bars, label row (table fallback without GD). */
    private function addVerticalBarChart($container, $items, string $valueKey, string $labelKey, string $color, int $innerWidth): void
    {
        if ($items->isEmpty()) {
            $this->addEmptyNote($container, 'No data for the selected filters.');

            return;
        }

        $count = $items->count();
        $colW = (int) floor($innerWidth / $count);
        $values = [];
        foreach ($items as $item) {
            $values[] = (float) ($item[$valueKey] ?? 0);
        }

        $table = $container->addTable($this->noBorderTableStyle(['width' => $colW * $count, 'unit' => 'dxa', 'layout' => 'fixed', 'cellMargin' => 0]));
        $table->addRow(null, ['cantSplit' => true]);
        foreach ($items as $item) {
            $table->addCell($colW)->addText((string) $item[$valueKey], ['bold' => true, 'size' => 8.5, 'color' => '333333'], ['alignment' => 'center', 'spaceAfter' => 20, 'keepNext' => true]);
        }

        $table->addRow(null, ['cantSplit' => true]);
        $body = $table->addCell($colW * $count, ['gridSpan' => $count]);
        // PhpWord image sizes are in points (twips / 20); the PNG itself is drawn at 2x for crispness.
        $wPt = (int) floor($colW * $count / 20);
        $png = $this->canDrawImages() ? $this->pngBars($values, $color, $wPt * 2, 150) : null;
        if ($png !== null) {
            $body->addTextRun(['spaceAfter' => 0, 'keepNext' => true])->addImage($png, ['width' => $wPt, 'height' => 75]);
        } else {
            $max = max(1.0, max($values));
            foreach ($values as $v) {
                // (no GD) a simple proportional text bar keeps the numbers readable
                $body->addText(str_repeat('█', (int) round($v / $max * 12)), ['size' => 6, 'color' => $color], ['spaceAfter' => 0]);
            }
        }

        $table->addRow(null, ['cantSplit' => true]);
        foreach ($items as $item) {
            $table->addCell($colW)->addText((string) ($item[$labelKey] ?? ''), ['size' => 8, 'color' => '8A8F8F'], ['alignment' => 'center', 'spaceAfter' => 0]);
        }
    }

    /** Thin rounded progress meter followed by the percentage (inside a card cell). */
    private function addMiniProgressBar($cell, float $percentage, string $color, int $innerWidth): void
    {
        $label = round($percentage) . '%';
        $run = $cell->addTextRun(['spaceAfter' => 30, 'spaceBefore' => 20]);
        $barPt = max(40, (int) floor(($innerWidth - 700) / 20));
        $png = $this->canDrawImages() ? $this->pngPill($percentage, $barPt * 3, 18, $color) : null;
        if ($png !== null) {
            $run->addImage($png, ['width' => $barPt, 'height' => 6]);
            $run->addText('  ' . $label, ['bold' => true, 'size' => 9, 'color' => '005F63']);
        } else {
            $run->addText($label, ['bold' => true, 'size' => 9, 'color' => '005F63']);
        }
    }

    /** Big percentage + proportional pill + caption -- the PDF's "Overall Attendance" card body. */
    private function addProgressSummary($container, float $percentage, string $caption, string $color, int $innerWidth): void
    {
        $center = ['alignment' => 'center', 'spaceAfter' => 0];
        $container->addText(round($percentage) . '%', ['bold' => true, 'size' => 28, 'color' => $color], ['alignment' => 'center', 'spaceBefore' => 100, 'spaceAfter' => 40]);
        $pillPt = max(60, (int) floor(($innerWidth - 500) / 20));
        $png = $this->canDrawImages() ? $this->pngPill($percentage, $pillPt * 3, 24, $color) : null;
        if ($png !== null) {
            $container->addTextRun(['alignment' => 'center', 'spaceAfter' => 60])->addImage($png, ['width' => $pillPt, 'height' => 8]);
        }
        $container->addText($caption, ['size' => 8.5, 'color' => '8A8F8F'], $center);
    }

    private function canDrawImages(): bool
    {
        return function_exists('imagecreatetruecolor') && function_exists('imagepng') && function_exists('imagecopyresampled');
    }

    /** @return array{0:int,1:int,2:int} */
    private function hexRgb(string $hex): array
    {
        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }

    /** Filled rectangle with rounded top corners (supersampled canvas coordinates). */
    private function gdRoundedTop($im, float $x0, float $y0, float $x1, float $y1, float $r, $col): void
    {
        $r = min($r, ($x1 - $x0) / 2, $y1 - $y0);
        imagefilledrectangle($im, (int) round($x0), (int) round($y0 + $r), (int) round($x1), (int) round($y1), $col);
        imagefilledrectangle($im, (int) round($x0 + $r), (int) round($y0), (int) round($x1 - $r), (int) round($y0 + $r), $col);
        imagefilledellipse($im, (int) round($x0 + $r), (int) round($y0 + $r), (int) round($r * 2), (int) round($r * 2), $col);
        imagefilledellipse($im, (int) round($x1 - $r), (int) round($y0 + $r), (int) round($r * 2), (int) round($r * 2), $col);
    }

    /** Bar-chart PNG (rounded bars on a faint grid) -- returns raw PNG bytes. */
    private function pngBars(array $values, string $hex, int $wPx, int $hPx): ?string
    {
        $s = 2;
        $W = $wPx * $s;
        $H = $hPx * $s;
        $im = imagecreatetruecolor($W, $H);
        imagefill($im, 0, 0, imagecolorallocate($im, 255, 255, 255));
        [$r, $g, $b] = $this->hexRgb($hex);
        $col = imagecolorallocate($im, $r, $g, $b);
        $grid = imagecolorallocate($im, 238, 242, 242);
        $base = $H - 2 * $s;
        $usable = $H - 8 * $s;
        foreach ([0.25, 0.5, 0.75, 1.0] as $f) {
            $y = (int) ($base - $usable * $f);
            imageline($im, 0, $y, $W, $y, $grid);
        }
        imagefilledrectangle($im, 0, $base, $W, $base + $s, imagecolorallocate($im, 221, 213, 202));
        $n = max(1, count($values));
        $colW = $W / $n;
        $barW = $colW * 0.62;
        $max = max(1.0, max($values));
        foreach ($values as $i => $v) {
            $h = $v > 0 ? max(6 * $s, ($v / $max) * $usable) : 2 * $s;
            $x0 = $i * $colW + ($colW - $barW) / 2;
            $this->gdRoundedTop($im, $x0, $base - $h, $x0 + $barW, $base, 5 * $s, $col);
        }
        $out = imagecreatetruecolor($wPx, $hPx);
        imagecopyresampled($out, $im, 0, 0, 0, 0, $wPx, $hPx, $W, $H);
        ob_start();
        imagepng($out);
        $png = ob_get_clean();

        return $png !== false && $png !== '' ? $png : null;
    }

    /** Rounded progress "pill" PNG: grey track with a colored fill to $pct percent. */
    private function pngPill(float $pct, int $wPx, int $hPx, string $hex): ?string
    {
        $s = 2;
        $W = $wPx * $s;
        $H = $hPx * $s;
        $im = imagecreatetruecolor($W, $H);
        imagefill($im, 0, 0, imagecolorallocate($im, 255, 255, 255));
        $round = function ($w, $color) use ($im, $H) {
            $r = $H / 2;
            if ($w < $H) {
                $w = $H;
            }
            imagefilledellipse($im, (int) $r, (int) $r, $H, $H, $color);
            imagefilledellipse($im, (int) ($w - $r), (int) $r, $H, $H, $color);
            imagefilledrectangle($im, (int) $r, 0, (int) ($w - $r), $H - 1, $color);
        };
        $round($W, imagecolorallocate($im, 238, 242, 242));
        $pct = max(0.0, min(100.0, $pct));
        if ($pct > 0) {
            [$r, $g, $b] = $this->hexRgb($hex);
            $round($W * $pct / 100, imagecolorallocate($im, $r, $g, $b));
        }
        $out = imagecreatetruecolor($wPx, $hPx);
        imagecopyresampled($out, $im, 0, 0, 0, 0, $wPx, $hPx, $W, $H);
        ob_start();
        imagepng($out);
        $png = ob_get_clean();

        return $png !== false && $png !== '' ? $png : null;
    }

    /**
     * Same condition → color mapping as ReportsView.tsx's conditionColor
     * object and the PDF Blade view, as plain hex pairs.
     *
     * @return array{0: string, 1: string} [bgColor, textColor]
     */
    private function conditionColors(string $condition): array
    {
        return match ($condition) {
            'New' => ['E6F5F3', '0F766E'],
            'Good' => ['ECFDF5', '047857'],
            'Fair' => ['FFFBEB', 'B45309'],
            'Poor' => ['FFF7ED', 'C2410C'],
            'Disposed' => ['F3F4F6', '6B7280'],
            'Lost' => ['FEF2F2', 'DC2626'],
            default => ['F3F4F6', '6B7280'],
        };
    }
}

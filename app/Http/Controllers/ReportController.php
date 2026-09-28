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
use Illuminate\Support\Facades\Log;
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

        $eventsQuery = Event::withoutTrashed()->whereNotNull('approved_budget');
        if ($eventId) {
            $eventsQuery->where('id', $eventId);
        } else {
            if ($dateFrom) $eventsQuery->whereDate('event_start', '>=', $dateFrom);
            if ($dateTo) $eventsQuery->whereDate('event_start', '<=', $dateTo);
        }

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

        return [
            'summary' => [
                'total_events' => $events->count(),
                'total_approved_budget' => round($events->sum('approved_budget'), 2),
                'total_expenses' => round($perEvent->sum('total_expenses'), 2),
                'total_remaining' => round($perEvent->sum('remaining'), 2),
                'events_over_budget' => $perEvent->where('is_over_budget', true)->count(),
            ],
            'per_event' => $perEvent,
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
        if ($condition) $query->where('condition', $condition);

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

        $payload = $this->buildExportPayload($request);
        $phpWord = $this->buildWordDocument($payload);

        $fileName = Str::slug($payload['reportTitle']) . '.docx';
        $tempPath = tempnam(sys_get_temp_dir(), 'piao_report_');
        $phpWord->save($tempPath, 'Word2007');

        // PhpWord always writes table borders with w:val="single" even when
        // the width is set to 0 (its border-style API has no "none"/"nil"
        // option) -- Word itself treats a 0-width single border as invisible,
        // but some viewers (notably LibreOffice) still draw a thin hairline
        // for it. That showed up as unwanted grid lines through the stat
        // tiles, bar charts, and per-event cards. Rewriting those specific
        // zero-width borders to w:val="nil" directly in the saved .docx's
        // XML removes the lines everywhere, without touching real borders.
        $this->stripZeroWidthTableBorders($tempPath);

        return response()->download($tempPath, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ])->deleteFileAfterSend(true);
    }

    /**
     * Post-process a saved .docx and turn every table border PhpWord wrote
     * with width 0 (top/left/right/bottom/insideH/insideV) from
     * w:val="single" w:sz="0" into w:val="nil", which every Word-compatible
     * renderer treats as "no border at all" rather than a possible hairline.
     */
    private function stripZeroWidthTableBorders(string $docxPath): void
    {
        try {
            if (!class_exists('PclZip', false)) {
                require_once base_path('vendor/phpoffice/phpword/src/PhpWord/Shared/PCLZip/pclzip.lib.php');
            }

            $zip = new \PclZip($docxPath);
            $extracted = $zip->extract(PCLZIP_OPT_EXTRACT_AS_STRING, PCLZIP_OPT_BY_NAME, 'word/document.xml');
            if (!is_array($extracted) || empty($extracted[0]['content'])) {
                return;
            }

            $xml = $extracted[0]['content'];
            $fixed = preg_replace_callback(
                '/<w:(top|left|right|bottom|insideH|insideV)\b([^>]*)\/>/',
                function (array $m): string {
                    if (strpos($m[2], 'w:sz="0"') === false) {
                        return $m[0];
                    }

                    $attrs = preg_replace('/w:val="[^"]*"/', 'w:val="nil"', $m[2]);

                    return '<w:' . $m[1] . $attrs . '/>';
                },
                $xml
            );

            if ($fixed === null || $fixed === $xml) {
                return;
            }

            // PCLZip has no in-place "replace" -- delete the old entry then
            // add the patched XML back under the exact same name.
            $tmpDir = sys_get_temp_dir() . '/phpword_fix_' . uniqid();
            mkdir($tmpDir, 0777, true);
            $tmpFile = $tmpDir . '/document.xml';
            file_put_contents($tmpFile, $fixed);

            $zip->delete(PCLZIP_OPT_BY_NAME, 'word/document.xml');
            $zip->add($tmpFile, PCLZIP_OPT_REMOVE_PATH, $tmpDir, PCLZIP_OPT_ADD_PATH, 'word');

            @unlink($tmpFile);
            @rmdir($tmpDir);
        } catch (\Throwable $e) {
            // Purely cosmetic cleanup -- if anything about the zip surgery
            // fails for any reason, silently keep the original, otherwise-
            // valid .docx rather than break the download.
            Log::warning('Could not strip zero-width table borders from exported Word document', [
                'message' => $e->getMessage(),
            ]);
        }
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

        $data = match ($type) {
            'membership' => $this->buildMembershipData($request),
            'budget' => $this->buildBudgetData($request),
            'inventory' => $this->buildInventoryData($request),
            default => $this->buildAttendanceData($request),
        };

        return [
            'type' => $type,
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
     * (used for the PDF download) -- same letterhead, same section order,
     * same English-only copy, just assembled with PhpWord's object API
     * instead of Blade/HTML since a .docx isn't rendered from a view.
     */
    private function buildWordDocument(array $payload): PhpWord
    {
        $phpWord = new PhpWord();
        $phpWord->setDefaultFontName('Calibri');
        $phpWord->setDefaultFontSize(10);

        $section = $phpWord->addSection([
            'marginLeft' => 900,
            'marginRight' => 900,
            'marginTop' => 900,
            'marginBottom' => 900,
        ]);

        $center = ['alignment' => 'center'];
        $tiny = ['size' => 8, 'color' => '667777'];

        $section->addText('REPUBLIC OF THE PHILIPPINES', $tiny, $center);
        $section->addText('Province of Zamboanga del Norte', $tiny, $center);
        $section->addText('Municipality of President Manuel A. Roxas', $tiny, $center);
        $section->addText('BARANGAY PIAO', ['bold' => true, 'size' => 16, 'color' => '005F63'], $center);
        $section->addText('Piao Barangay Hall, Purok Uno, Barangay Piao, 7104', $tiny, $center);
        $section->addText('PIAO CONNECT', ['bold' => true, 'size' => 8, 'color' => '4FBEB0'], $center);
        $section->addTextBreak(1);
        $section->addText(strtoupper($payload['reportTitle']), ['bold' => true, 'size' => 13, 'color' => '005F63'], $center);
        $section->addText($payload['filterSummary'], ['size' => 9, 'color' => '667777'], $center);
        $section->addTextBreak(1);

        $data = $payload['data'];
        $headerCellStyle = ['bgColor' => '005F63'];
        $headerFont = ['bold' => true, 'color' => 'FFFFFF', 'size' => 9];
        $cellFont = ['size' => 9];
        $phpWord->addTableStyle('ReportTable', ['borderSize' => 4, 'borderColor' => 'CCCCCC', 'cellMargin' => 80]);

        switch ($payload['type']) {
            case 'attendance':
                $s = $data['summary'];
                $this->addStatTiles($section, [
                    [(string) $s['total_events'], 'Events in Range', '456F68'],
                    [(string) $s['total_attended'], 'Attendance Records', 'C6953C'],
                    [$s['attendance_percentage'] . '%', 'Attendance Rate', '2A423E'],
                    [$s['average_feedback_rating'] !== null ? (string) $s['average_feedback_rating'] : 'N/A', 'Avg Feedback Rating', '8A3D2C'],
                ]);

                // Same lg:grid-cols-3 (2 cols + 1 col) row as the on-screen
                // page -- "Events per Month" and "Overall Attendance" sit
                // side by side, not stacked, so this copies that instead of
                // just matching the two cards individually.
                $this->addTwoColumnRow(
                    $section,
                    6000,
                    3000,
                    function ($cell) use ($data) {
                        $this->addCardHeading($cell, 'Events per Month', 'What events usually happen, and when — across all years in range.');
                        $this->addVerticalBarChart($cell, $data['per_month'], 'events', 'month', '4FBEB0');
                    },
                    function ($cell) use ($s) {
                        $this->addCardHeading($cell, 'Overall Attendance');
                        $this->addProgressSummary(
                            $cell,
                            (float) $s['attendance_percentage'],
                            $s['total_attended'] . ' of ' . $s['total_eligible'] . ' eligible residents',
                            '4FBEB0'
                        );
                    }
                );

                $this->addCardHeading($section, 'Attendance by Age Group', 'Adviser recommendation: resident profiling filtered by age.');
                $this->addVerticalBarChart($section, $data['age_breakdown'], 'attended', 'group', 'E8B84A');

                $this->addCardHeading($section, 'Per-Event Breakdown');
                $this->addCardGrid($section, $data['per_event'], function ($cell, $ev) {
                    $cell->addText($ev['name'], ['bold' => true, 'size' => 9, 'color' => '005F63']);
                    $cell->addText($ev['date'] ?? '—', ['size' => 7.5, 'color' => '999999']);
                    $this->addMiniProgressBar($cell, (float) $ev['percentage'], '0F766E');
                    $cell->addText($ev['attended'] . ' / ' . $ev['eligible'] . ' attended', ['size' => 8, 'color' => '667777']);
                    if ($ev['approved_budget'] !== null) {
                        $cell->addText(
                            'Budget: ₱' . number_format($ev['approved_budget'], 2) . ' · Spent: ₱' . number_format($ev['total_expenses'], 2),
                            ['size' => 8, 'color' => '667777']
                        );
                    }
                });
                break;

            case 'membership':
                $s = $data['summary'];
                $this->addStatTiles($section, [
                    [(string) $s['total_memberships'], 'Total Memberships', '456F68'],
                    [(string) $s['total_assignments'], 'Total Enrolled Residents', 'C6953C'],
                ]);

                $this->addCardHeading($section, 'Enrollment by Membership');
                $this->addCardGrid($section, $data['per_membership'], function ($cell, $m) {
                    $reqs = implode(' • ', array_filter([
                        $m['eligible_age_bracket'] ?? null,
                        $m['eligible_civil_status'] ?? null,
                        $m['eligible_gender'] ?? null,
                    ]));
                    $cell->addText($m['name'], ['bold' => true, 'size' => 9, 'color' => '005F63']);
                    $cell->addText((string) $m['member_count'], ['bold' => true, 'size' => 15, 'color' => '333333']);
                    $cell->addText('members', ['size' => 7.5, 'color' => '999999']);
                    if ($reqs !== '') {
                        $cell->addText('Requires: ' . $reqs, ['size' => 8, 'color' => '0F766E']);
                    }
                });
                break;

            case 'budget':
                $s = $data['summary'];
                $this->addStatTiles($section, [
                    ['₱' . number_format($s['total_approved_budget'], 2), 'Total Approved Budget', '456F68'],
                    ['₱' . number_format($s['total_expenses'], 2), 'Total Expenses', 'C6953C'],
                    ['₱' . number_format($s['total_remaining'], 2), 'Remaining Budget', '2A423E'],
                    [(string) $s['events_over_budget'], 'Events Over Budget', '8A3D2C'],
                ]);

                $this->addCardHeading($section, 'Budget per Event');
                $this->addCardGrid($section, $data['per_event'], function ($cell, $ev) {
                    $cell->addText($ev['name'], ['bold' => true, 'size' => 9, 'color' => '005F63']);
                    $cell->addText($ev['date'] ?? '—', ['size' => 7.5, 'color' => '999999']);
                    $cell->addText('Budget: ₱' . number_format($ev['approved_budget'], 2), ['size' => 8, 'color' => '667777']);
                    $cell->addText('Spent: ₱' . number_format($ev['total_expenses'], 2), ['size' => 8, 'color' => '667777']);
                    $remainingLabel = ($ev['is_over_budget'] ? 'Over budget by ' : 'Remaining ') . '₱' . number_format(abs($ev['remaining']), 2);
                    $cell->addText($remainingLabel, ['bold' => true, 'size' => 8.5, 'color' => $ev['is_over_budget'] ? 'DC2626' : '0F766E']);
                }, fn ($ev) => $ev['is_over_budget'] ? 'FEF2F2' : 'FAFAF7');

                if (!empty($data['top_expenses'])) {
                    $this->addCardHeading($section, 'Top Expenses');
                    $table2 = $section->addTable('ReportTable');
                    $table2->addRow();
                    foreach (['Item', 'Event', 'Amount'] as $h) {
                        $table2->addCell(3000, $headerCellStyle)->addText($h, $headerFont);
                    }
                    foreach ($data['top_expenses'] as $ex) {
                        $table2->addRow();
                        $table2->addCell(3000)->addText($ex['item'], $cellFont);
                        $table2->addCell(3000)->addText($ex['event_name'] ?? '—', $cellFont);
                        $table2->addCell(3000)->addText('₱' . number_format($ex['amount'], 2), $cellFont);
                    }
                }
                break;

            default: // inventory
                $s = $data['summary'];
                $this->addStatTiles($section, [
                    [(string) $s['total_items'], 'Total Inventory Items', '456F68'],
                    [(string) $s['total_quantity'], 'Total Quantity', 'C6953C'],
                ]);

                $this->addCardHeading($section, 'By Condition');
                $conditionRow = $section->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0, 'cellSpacing' => 60]);
                $conditionRow->addRow();
                foreach ($data['by_condition'] as $c) {
                    [$bg, $fg] = $this->conditionColors($c['condition']);
                    $conditionRow->addCell(2600, ['bgColor' => $bg])
                        ->addText($c['condition'] . ': ' . $c['count'] . ' items (' . $c['quantity'] . ' units)', ['size' => 8, 'bold' => true, 'color' => $fg]);
                }

                $this->addCardHeading($section, 'Inventory Items');
                $this->addCardGrid($section, $data['items'], function ($cell, $item) {
                    [$bg, $fg] = $this->conditionColors($item['condition']);
                    $cell->addText($item['name'], ['bold' => true, 'size' => 9, 'color' => '005F63']);
                    $cell->addText($item['storage_location'] ?? '—', ['size' => 7.5, 'color' => '999999']);
                    $condTable = $cell->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0]);
                    $condTable->addRow();
                    $condTable->addCell(2200, ['bgColor' => $bg])->addText($item['condition'], ['size' => 7.5, 'bold' => true, 'color' => $fg]);
                    $condTable->addCell(1800)->addText('×' . $item['quantity'], ['bold' => true, 'size' => 9, 'color' => '333333'], ['alignment' => 'right']);
                });
                break;
        }

        $section->addTextBreak(2);
        // 4500 + 4500 = 9000 twips, matching the same content-width
        // convention every other table in this document uses (addStatTiles,
        // addTwoColumnRow, etc.) -- the previous 5000 + 5000 = 10000 was
        // wider than the section's usable width, which made Word/LibreOffice
        // shrink and left-anchor the whole table instead of spanning it
        // edge-to-edge like the on-screen/print signature row does.
        $sigTable = $section->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0, 'alignment' => 'center']);
        $sigTable->addRow();
        $sigTable->addCell(4500)->addText('_____________________________', [], $center);
        $sigTable->addCell(4500)->addText('_____________________________', [], $center);
        $sigTable->addRow();
        $sigTable->addCell(4500)->addText('Prepared by', ['size' => 9], $center);
        $sigTable->addCell(4500)->addText('Barangay Captain', ['size' => 9], $center);

        $section->addTextBreak(1);
        $section->addText(
            'Generated via Piao Connect — Barangay Information Management System · ' . $payload['printedOn'],
            ['size' => 7, 'color' => '999999'],
            $center
        );

        return $phpWord;
    }

    /**
     * Colored stat tiles -- the .docx equivalent of the on-screen/PDF
     * gradient stat cards. PhpWord's Cell style has no border properties in
     * the installed version (only bgColor/shading), so the "tile" look comes
     * entirely from a solid fill color with white bold text, spaced apart
     * with the table's own cellSpacing instead of a border.
     *
     * @param array<int, array{0: string, 1: string, 2: string}> $tiles [value, label, hexColor]
     */
    private function addStatTiles($section, array $tiles): void
    {
        $width = (int) floor(9000 / max(1, count($tiles)));
        $table = $section->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0, 'cellSpacing' => 80]);
        $table->addRow();
        foreach ($tiles as [$value, $label, $color]) {
            $cell = $table->addCell($width, ['bgColor' => $color]);
            $cell->addText($value, ['bold' => true, 'size' => 16, 'color' => 'FFFFFF']);
            $cell->addText(strtoupper($label), ['bold' => true, 'size' => 7, 'color' => 'FFFFFF']);
        }
        $section->addTextBreak(1);
    }

    private function addCardHeading($section, string $title, ?string $desc = null): void
    {
        $section->addText($title, ['bold' => true, 'size' => 11, 'color' => '005F63']);
        if ($desc !== null) {
            $section->addText($desc, ['size' => 7.5, 'color' => '999999']);
        }
    }

    /**
     * Vertical bar chart -- a real copy of the on-screen/PDF BarChart's
     * column look, not just an equivalent. A .docx table row can't vary one
     * cell's height independently of its neighbours, so a single "bar" is
     * built out of a short stack of tiny fixed-height rows instead (one
     * table column per category, `$levels` thin rows per column): rows
     * within each column's filled height get the accent bgColor, the rest
     * stay unshaded, so the shaded cells read as one solid bar growing up
     * from the baseline -- the same technique as a pixel/voxel bar chart,
     * built entirely from Cell::bgColor and Row::exactHeight (both already
     * proven cell/row style keys in this PhpWord version).
     */
    private function addVerticalBarChart($section, $items, string $valueKey, string $labelKey, string $color, int $levels = 9): void
    {
        if ($items->isEmpty()) {
            $section->addText('No data for the selected filters.', ['italic' => true, 'size' => 9, 'color' => 'AAAAAA']);
            $section->addTextBreak(1);

            return;
        }

        $count = $items->count();
        $colWidth = (int) floor(8500 / max(1, $count));
        $levelHeight = 95;
        $max = max(1, (float) ($items->max($valueKey) ?? 0));

        $filledLevels = [];
        foreach ($items as $item) {
            $value = (float) ($item[$valueKey] ?? 0);
            $filledLevels[] = $value > 0 ? max(1, (int) round(($value / $max) * $levels)) : 0;
        }

        $table = $section->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0, 'cellMargin' => 20]);

        // Row 0: the value shown above each bar, same as BarChart's own
        // per-bar value label.
        $table->addRow();
        foreach ($items as $item) {
            $table->addCell($colWidth)->addText((string) $item[$valueKey], ['bold' => true, 'size' => 8], ['alignment' => 'center']);
        }

        // Rows 1..levels: the bar body itself, tallest level first so the
        // shaded cells accumulate toward the bottom row (the baseline).
        for ($level = $levels; $level >= 1; $level--) {
            $table->addRow($levelHeight, ['exactHeight' => true]);
            foreach ($filledLevels as $filled) {
                $cell = $table->addCell($colWidth, $level <= $filled ? ['bgColor' => $color] : []);
                $cell->addText('');
            }
        }

        // Final row: the category label under each bar.
        $table->addRow();
        foreach ($items as $item) {
            $table->addCell($colWidth)->addText((string) ($item[$labelKey] ?? ''), ['size' => 7.5, 'color' => '999999'], ['alignment' => 'center']);
        }

        $section->addTextBreak(1);
    }

    /**
     * A compact two-column layout row -- the .docx equivalent of the
     * on-screen `lg:grid-cols-3` row that puts "Events per Month" and
     * "Overall Attendance" side by side instead of stacked full-width, so
     * this matches that arrangement instead of just matching each card on
     * its own. $left/$right receive the Cell to build their content into,
     * exactly like $section elsewhere.
     */
    private function addTwoColumnRow($section, int $leftWidth, int $rightWidth, callable $left, callable $right): void
    {
        $table = $section->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0, 'cellSpacing' => 100]);
        $table->addRow();
        $left($table->addCell($leftWidth));
        $right($table->addCell($rightWidth));
        $section->addTextBreak(1);
    }

    /**
     * A thin horizontal percentage meter -- the .docx equivalent of the
     * on-screen per-event progress bar (a filled + empty two-cell "track",
     * same trick as addProgressSummary's bigger version) so each
     * Per-Event-Breakdown card gets a real bar next to its rate, not just
     * the number on its own.
     */
    private function addMiniProgressBar($cell, float $percentage, string $color): void
    {
        $clamped = max(0, min(100, $percentage));
        $trackWidth = 3400;
        $filled = (int) round(($clamped / 100) * $trackWidth);
        $remainder = max(0, $trackWidth - $filled);

        $table = $cell->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0]);
        $table->addRow();
        if ($filled > 0) {
            $table->addCell($filled, ['bgColor' => $color])->addText('');
        }
        if ($remainder > 0) {
            $table->addCell($remainder, ['bgColor' => 'EEEEEE'])->addText('');
        }
        $table->addCell(900)->addText(round($percentage) . '%', ['bold' => true, 'size' => 8, 'color' => $color], ['alignment' => 'right']);
    }

    /**
     * "Overall Attendance" donut equivalent -- a .docx can't draw an SVG
     * ring, so this keeps the same information (big percentage + a
     * proportional bar + a caption) the on-screen DonutChart already shows
     * next to its ring, just without the ring itself.
     */
    private function addProgressSummary($section, float $percentage, string $caption, string $color): void
    {
        $clamped = max(0, min(100, $percentage));
        $center = ['alignment' => 'center'];
        $section->addText(round($percentage) . '%', ['bold' => true, 'size' => 26, 'color' => $color], $center);

        $trackWidth = 6000;
        $filled = (int) round(($clamped / 100) * $trackWidth);
        $remainder = max(0, $trackWidth - $filled);
        $table = $section->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0, 'alignment' => 'center']);
        $table->addRow();
        if ($filled > 0) {
            $table->addCell($filled, ['bgColor' => $color])->addText('');
        }
        if ($remainder > 0) {
            $table->addCell($remainder, ['bgColor' => 'EEEEEE'])->addText('');
        }

        $section->addText($caption, ['size' => 8.5, 'color' => '999999'], $center);
        $section->addTextBreak(1);
    }

    /**
     * Two-per-row "card" grid -- the .docx equivalent of the on-screen
     * `grid gap-3 sm:grid-cols-2` record cards. Cards get a light fill via
     * Cell::bgColor (the only per-cell styling this PhpWord version
     * supports -- no per-cell borders) so each record still reads as a
     * distinct tile instead of a plain table row.
     *
     * @param iterable<mixed> $items
     * @param callable(mixed, mixed): void $fillCell receives (Cell, item) and adds its content
     * @param (callable(mixed): string)|null $bgColorFor optional per-item bgColor override (defaults to a light neutral)
     */
    private function addCardGrid($section, $items, callable $fillCell, ?callable $bgColorFor = null): void
    {
        $items = collect($items)->values();
        if ($items->isEmpty()) {
            $section->addText('No records found.', ['italic' => true, 'size' => 9, 'color' => 'AAAAAA']);
            $section->addTextBreak(1);

            return;
        }

        foreach ($items->chunk(2) as $pair) {
            $table = $section->addTable(['borderSize' => 0, 'borderInsideHSize' => 0, 'borderInsideVSize' => 0, 'cellSpacing' => 80]);
            $table->addRow();
            foreach ($pair as $item) {
                $bg = $bgColorFor ? $bgColorFor($item) : 'FAFAF7';
                $cell = $table->addCell(4500, ['bgColor' => $bg]);
                $fillCell($cell, $item);
            }
            if ($pair->count() < 2) {
                $table->addCell(4500)->addText('');
            }
        }
        $section->addTextBreak(1);
    }

    /**
     * Same condition → color mapping as ReportsView.tsx's conditionColor
     * object and this same controller's exportPdf Blade view, translated to
     * plain hex pairs for PhpWord's font/cell color options.
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

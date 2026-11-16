<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\User;
use App\Support\ActivityLogReport;
use App\Support\CsvReport;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    /** The filters the screen and the reports share (see ActivityLog::scopeFiltered), incl. the quick "period". */
    private function filters(Request $request): array
    {
        return ActivityLogReport::filtersFrom($request);
    }

    private function direction(Request $request): string
    {
        return ActivityLogReport::direction($request);
    }

    public function index(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate(ActivityLogReport::rules(false));

        return response()->json(
            ActivityLog::query()
                ->filtered($this->filters($request))
                ->orderBy('created_at', $this->direction($request))
                ->orderBy('id', $this->direction($request))
                ->paginate(20)
        );
    }

    public function show($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            ActivityLog::findOrFail($id)
        );
    }

    public function today(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            ActivityLog::query()
                ->filtered(['search' => $request->input('search'), 'date' => now()->timezone('Asia/Manila')->toDateString()])
                ->orderBy('created_at', 'desc')
                ->orderBy('id', 'desc')
                ->paginate(20)
        );
    }

    /**
     * Report of the activity log -- exactly the rows the screen shows for the same filters
     * (search, module, day / day range / quick period, sort), not one page of them, with only the
     * columns the staff member ticked. Two forms: with ?as=json the structured report (letterhead
     * data, optional message, table) that the browser turns into the styled Excel workbook
     * (lib/activityLogExport.ts), otherwise a plain CSV file (App\Support\CsvReport).
     * The PDF is POST /activity-logs/export/pdf. Exporting is itself written to the log.
     */
    public function exportCsv(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $asExcel = $request->query('as') === 'json';
        $request->validate(ActivityLogReport::rules($asExcel) + ['as' => 'nullable|in:json']);

        $filters = $this->filters($request);
        $dir = $this->direction($request);

        if ($asExcel) {
            $report = new ActivityLogReport($filters, $dir, (array) $request->input('columns'), $request->boolean('message', true));
            $count = $report->count();
            if ($count > ActivityLogReport::EXCEL_MAX_ROWS) {
                return response()->json(['message' => ActivityLogReport::tooManyMessage('Excel', $count)], 422);
            }

            $data = $report->build();
            $this->logExport('Excel', $data['total'], $data['filterSummary']);

            return response()->json($data);
        }

        // Plain CSV: every column, frozen at "now" like the report so the count matches the rows.
        $lastId = (int) ActivityLog::max('id');
        $base = fn () => ActivityLog::query()->filtered($filters)->where('id', '<=', $lastId);
        $count = $base()->count();
        $filterLine = ActivityLogReport::describe($filters, $dir, $count);
        $this->logExport('CSV', $count, $filterLine);

        $names = User::withTrashed()->where('role', 'Staff')
            ->get(['user_code', 'first_name', 'last_name'])
            ->mapWithKeys(fn ($u) => [$u->user_code => trim($u->first_name . ' ' . $u->last_name)]);

        $rows = (function () use ($base, $dir, $names) {
            $n = 0;
            foreach ($base()->orderBy('created_at', $dir)->orderBy('id', $dir)->cursor() as $log) {
                yield [
                    ++$n,
                    optional($log->created_at)->format('Y-m-d H:i:s'),
                    $log->user_code,
                    $names[$log->user_code] ?? '',
                    $log->action,
                    $log->module,
                    $log->description,
                    $log->ip_address ?? '',
                ];
            }
        })();

        return CsvReport::stream(
            'Activity Log Report',
            $filterLine,
            ['No.', 'Date and time', 'Staff code', 'Staff name', 'Action', 'Module', 'Description', 'IP address'],
            $rows
        );
    }

    /**
     * The same report as a PDF on the barangay letterhead with the Captain / Secretary signature block.
     * POST because the column list is an array; the server reads the log itself, so the file always
     * matches the screen and the Excel file.
     */
    public function pdf(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate(ActivityLogReport::rules(true));

        $report = new ActivityLogReport($this->filters($request), $this->direction($request), (array) $request->input('columns'), $request->boolean('message', true));
        $count = $report->count();
        $columnCount = count(array_unique((array) $request->input('columns')));
        // Refuse before drawing: running out of memory inside dompdf is a fatal error, not something to catch.
        if ($count > ActivityLogReport::pdfMaxRows($columnCount)) {
            return response()->json(['message' => ActivityLogReport::tooManyMessage('PDF', $count, $columnCount)], 422);
        }

        // A little headroom for the layout of a long table (the cap above keeps it well inside this).
        @ini_set('memory_limit', '768M');
        @set_time_limit(180);

        $data = $report->build();
        $this->logExport('PDF', $data['total'], $data['filterSummary']);

        $keys = array_map(fn ($c) => $c['key'], $data['columns']);
        $weightTotal = array_sum(array_map(fn ($k) => ActivityLogReport::COLUMNS[$k][1], $keys));

        $pdf = Pdf::loadView('activity_logs.export', [
            'columns' => array_map(fn ($c) => $c['label'], $data['columns']),
            'widths' => array_map(fn ($k) => round(ActivityLogReport::COLUMNS[$k][1] / $weightTotal * 100, 2), $keys),
            'centered' => array_keys(array_filter($keys, fn ($k) => ActivityLogReport::COLUMNS[$k][2])),
            'rows' => $data['rows'],
            'chunkSize' => ActivityLogReport::PDF_CHUNK_ROWS,
            'message' => $data['message'],
            'filterSummary' => $data['filterSummary'],
            'officials' => $data['officials'],
            'printedOn' => $data['printedOn'],
        ])->setPaper('a4', count($keys) <= 5 ? 'portrait' : 'landscape');

        // "Page X of Y" bottom-right, same stamp as the other reports.
        $pdf->render();
        $canvas = $pdf->getCanvas();
        $fontMetrics = $pdf->getFontMetrics();
        $font = $fontMetrics->getFont('DejaVu Sans');
        $this->drawRepeatedHeader($canvas, $fontMetrics, array_map(fn ($c) => $c['label'], $data['columns']), array_map(fn ($k) => round(ActivityLogReport::COLUMNS[$k][1] / $weightTotal * 100, 4), $keys), array_map(fn ($k) => ActivityLogReport::COLUMNS[$k][2], $keys));
        $size = 8;
        $pageCount = (string) $canvas->get_page_count();
        $width = $fontMetrics->getTextWidth('Page ' . str_repeat('0', strlen($pageCount)) . ' of ' . $pageCount, $font, $size);
        $canvas->page_text(
            $canvas->get_width() - (12 * 72 / 25.4) - $width,
            $canvas->get_height() - 28,
            'Page {PAGE_NUM} of {PAGE_COUNT}',
            $font,
            $size,
            [0.55, 0.6, 0.6]
        );

        return $pdf->download('activity-log-report-' . now()->format('Ymd') . '.pdf');
    }

    private function logExport(string $format, int $count, string $filterLine): void
    {
        $this->createLog('Export', 'Reports', "Exported the Activity Log Report as {$format} ({$count} " . ($count === 1 ? 'entry' : 'entries') . ") — {$filterLine}");
    }

    /**
     * The table header row at the top of every page after the first, drawn on the page itself so the report
     * can be laid out as several flush tables (cheap on memory) and still read as one table with a header on
     * every page. Matches the real header cells (see activity_logs/export.blade.php): navy fill, gold
     * uppercase labels, the same column widths, 13mm top margin.
     *
     * @param string[] $labels
     * @param float[]  $widths  percent of the table width, per column
     * @param bool[]   $centered
     */
    private function drawRepeatedHeader($canvas, $fontMetrics, array $labels, array $widths, array $centered): void
    {
        $font = $fontMetrics->getFont('DejaVu Sans', 'bold');
        $mm = 72 / 25.4;
        $left = 12 * $mm;
        $tableWidth = $canvas->get_width() - 2 * $left;
        $top = 13 * $mm - 22.5;     // header cells are ~22.5pt tall (9px padding twice + one 9.5px line)
        $height = 22.5;
        $size = 7.1;                // 9.5px
        $pad = 5.25;                // 7px

        $canvas->page_script(function ($pageNumber, $pageCount, $canvas, $fontMetrics) use ($labels, $widths, $centered, $font, $left, $tableWidth, $top, $height, $size, $pad) {
            if ($pageNumber < 2) {
                return;
            }
            $canvas->filled_rectangle($left, $top, $tableWidth, $height, [0.039, 0.055, 0.102]);
            $x = $left;
            foreach ($labels as $i => $label) {
                $colWidth = $tableWidth * $widths[$i] / 100;
                $text = mb_strtoupper($label);
                $textWidth = $fontMetrics->getTextWidth($text, $font, $size, 0, 0.3);
                $tx = $centered[$i] ? $x + ($colWidth - $textWidth) / 2 : $x + $pad;
                $canvas->text($tx, $top + ($height - $size) / 2 - 1, $text, $font, $size, [0.937, 0.792, 0.522], 0, 0.3);
                $x += $colWidth;
            }
        });
    }
}

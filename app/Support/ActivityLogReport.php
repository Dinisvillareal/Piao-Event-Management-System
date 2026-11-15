<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;

/**
 * The Activity Log Report: the same entries the screen shows for the same filters, with the columns
 * the staff member picked, as one table that both the Excel workbook (drawn in the browser) and the
 * PDF (drawn here) print. One builder, so the two files and the screen can never disagree.
 *
 * Column keys and order are mirrored in resources/js/lib/activityLogExport.ts -- keep them in sync.
 */
final class ActivityLogReport
{
    /** key => [header, relative PDF width, centered]. Printed in this order, whatever order they were ticked. */
    public const COLUMNS = [
        'no'          => ['No.', 5, true],
        'when'        => ['Date and time', 14, false],
        'code'        => ['Staff code', 9, false],
        'staff'       => ['Staff name', 15, false],
        'action'      => ['Action', 9, false],
        'module'      => ['Module', 11, false],
        'description' => ['Description', 34, false],
        'ip'          => ['IP address', 10, false],
    ];

    /** Fewest columns a report may have (the letterhead needs room for the seal and the address block). */
    public const MIN_COLUMNS = 3;

    /** The Excel workbook is drawn in the browser, the PDF by dompdf: both are capped, so narrow the filters beyond this. */
    public const EXCEL_MAX_ROWS = 10000;
    /** Rows per drawn table in the PDF: the report reads as one table, but is laid out in flush pieces of this many to save memory. */
    public const PDF_CHUNK_ROWS = 100;

    /**
     * The PDF is one file, laid out in flush pieces of PDF_CHUNK_ROWS rows. dompdf keeps the whole document in
     * memory (about 300 MB for 2,000 rows of 8 columns), so it is limited by cells (rows x columns): fewer
     * columns means more rows. Anything bigger belongs in the Excel file.
     * Mirrored in lib/activityLogExport.ts (PDF_MAX_CELLS) so the window can warn before downloading.
     */
    public const PDF_MAX_CELLS = 16000;

    public const PERIODS = ['all', 'today', '7d', '30d'];

    /** Validation rules shared by the screen, the Excel and the PDF requests; the report requests also need their columns. */
    public static function rules(bool $withColumns = true): array
    {
        $rules = [
            'search'    => 'nullable|string|max:200',
            'type'      => 'nullable|string|max:30',
            'date'      => 'nullable|date',
            'date_from' => 'nullable|date',
            'date_to'   => 'nullable|date|after_or_equal:date_from',
            'period'    => 'nullable|in:' . implode(',', self::PERIODS),
            'sort'      => 'nullable|in:asc,desc',
            'message'   => 'nullable|boolean',
        ];

        if ($withColumns) {
            $rules['columns'] = ['required', 'array', 'min:' . self::MIN_COLUMNS, 'max:' . count(self::COLUMNS)];
            $rules['columns.*'] = ['string', 'in:' . implode(',', array_keys(self::COLUMNS))];
        }

        return $rules;
    }

    /** Most entries one PDF can hold with this many columns. */
    public static function pdfMaxRows(int $columns): int
    {
        return intdiv(self::PDF_MAX_CELLS, max(1, $columns));
    }

    /** The 422 text when a report is too long for its file type. */
    public static function tooManyMessage(string $format, int $count, int $columns = 0): string
    {
        $max = $format === 'PDF' ? self::pdfMaxRows($columns) : self::EXCEL_MAX_ROWS;

        return 'Too many entries for one ' . $format . ' file (' . number_format($count) . '). Narrow the filters to ' . number_format($max) . ' entries or fewer.';
    }

    /** The filters the screen and the reports share (see ActivityLog::scopeFiltered), with a quick "period" turned into dates. */
    public static function filtersFrom(Request $request): array
    {
        $f = [
            'search'    => $request->input('search'),
            'type'      => $request->input('type'),
            'date'      => $request->input('date'),
            'date_from' => $request->input('date_from'),
            'date_to'   => $request->input('date_to'),
        ];

        // A quick period only fills in a date range when no day or range was chosen -- an explicit date wins.
        if (!$f['date'] && !$f['date_from'] && !$f['date_to']) {
            $today = Carbon::now('Asia/Manila')->startOfDay();
            switch ($request->input('period')) {
                case 'today':
                    $f['date'] = $today->toDateString();
                    break;
                case '7d':
                    [$f['date_from'], $f['date_to']] = [$today->copy()->subDays(6)->toDateString(), $today->toDateString()];
                    break;
                case '30d':
                    [$f['date_from'], $f['date_to']] = [$today->copy()->subDays(29)->toDateString(), $today->toDateString()];
                    break;
            }
        }

        return $f;
    }

    /** Oldest-first only when asked; whitelisted because the value comes from the query string. */
    public static function direction(Request $request): string
    {
        return $request->input('sort') === 'asc' ? 'asc' : 'desc';
    }

    /** "Module: Events · Date: November 13, 2026 · Search: "scan" · Newest first · 128 entries" */
    public static function describe(array $f, string $dir, int $count): string
    {
        $parts = [];

        $type = $f['type'] ?? null;
        if ($type && $type !== 'all' && isset(ActivityLog::MODULE_FILTERS[$type])) {
            $parts[] = 'Module: ' . ActivityLog::MODULE_FILTERS[$type];
        }

        $day = fn (?string $v) => $v ? Carbon::parse($v, 'Asia/Manila')->format('F j, Y') : null;
        if (!empty($f['date'])) {
            $parts[] = 'Date: ' . $day($f['date']);
        } elseif (!empty($f['date_from']) || !empty($f['date_to'])) {
            $parts[] = 'Dates: ' . ($day($f['date_from'] ?? null) ?? 'start') . ' to ' . ($day($f['date_to'] ?? null) ?? 'today');
        }

        $search = trim((string) ($f['search'] ?? ''));
        if ($search !== '') {
            $parts[] = 'Search: "' . mb_substr($search, 0, 100) . '"';
        }

        if (!$parts) {
            array_unshift($parts, 'All activity');
        }
        $parts[] = $dir === 'asc' ? 'Oldest first' : 'Newest first';
        $parts[] = $count . ($count === 1 ? ' entry' : ' entries');

        return implode(' · ', $parts);
    }

    private int $lastId;

    /**
     * @param string[] $columns keys of COLUMNS, any order
     */
    public function __construct(
        private array $filters,
        private string $dir,
        array $columns,
        private bool $withMessage = true,
    ) {
        // Fixed print order, no duplicates, nothing unknown.
        $this->columns = array_values(array_filter(array_keys(self::COLUMNS), fn ($k) => in_array($k, $columns, true)));
        // Freeze the report at "now": entries written while it is built (including the log line for this
        // very export) are not part of it, so the count in the heading always matches the rows.
        $this->lastId = (int) ActivityLog::max('id');
    }

    /** @var string[] */
    private array $columns;

    private function query()
    {
        return ActivityLog::query()->filtered($this->filters)->where('id', '<=', $this->lastId);
    }

    public function count(): int
    {
        return $this->query()->count();
    }

    public function filterLine(int $count): string
    {
        return self::describe($this->filters, $this->dir, $count);
    }

    /**
     * @return array{reportTitle:string, filterSummary:string, printedOn:string, generatedAt:string, message:string[], columns:array<int,array{key:string,label:string}>, rows:array<int,array<int,string>>, total:int}
     */
    public function build(): array
    {
        $names = User::withTrashed()->where('role', 'Staff')
            ->get(['user_code', 'first_name', 'last_name'])
            ->mapWithKeys(fn ($u) => [$u->user_code => trim($u->first_name . ' ' . $u->last_name)]);

        $rows = [];
        $staff = [];
        $modules = [];
        $first = $last = null;
        $n = 0;
        foreach ($this->query()->orderBy('created_at', $this->dir)->orderBy('id', $this->dir)->cursor() as $log) {
            $all = [
                'no'          => (string) ++$n,
                'when'        => optional($log->created_at)->format('M j, Y g:i A') ?? '',
                'code'        => (string) $log->user_code,
                'staff'       => (string) ($names[$log->user_code] ?? ''),
                'action'      => (string) $log->action,
                'module'      => (string) $log->module,
                'description' => (string) $log->description,
                'ip'          => (string) ($log->ip_address ?? ''),
            ];
            $rows[] = array_map(fn ($k) => $all[$k], $this->columns);
            $staff[$log->user_code] = true;
            $modules[$log->module] = true;
            $first ??= $log->created_at;
            $last = $log->created_at;
        }

        $count = count($rows);
        $printedOn = now()->format('F j, Y');

        return [
            'reportTitle'   => 'Activity Log Report',
            'filterSummary' => $this->filterLine($count),
            'printedOn'     => $printedOn,
            'generatedAt'   => now()->format('F j, Y g:i A'),
            'officials'     => BarangayOfficials::current(),
            'message'       => $this->withMessage ? $this->message($count, count($staff), count($modules), $first, $last, $printedOn) : [],
            'columns'       => array_map(fn ($k) => ['key' => $k, 'label' => self::COLUMNS[$k][0]], $this->columns),
            'rows'          => $rows,
            'total'         => $count,
        ];
    }

    /** The optional opening "I. MESSAGE": says only what this report holds, in the words of the Residents report. */
    private function message(int $count, int $staff, int $modules, ?Carbon $first, ?Carbon $last, string $printedOn): array
    {
        $entries = $count . ($count === 1 ? ' entry' : ' entries');
        $fields = array_map(fn ($k) => strtolower(self::COLUMNS[$k][0]), array_values(array_diff($this->columns, ['no'])));
        $fieldList = count($fields) > 1 ? implode(', ', array_slice($fields, 0, -1)) . ' and ' . end($fields) : ($fields[0] ?? '');

        $scope = 'all the activity recorded by staff in the system';
        $applied = $this->appliedFilterText();
        if ($applied !== '') {
            $scope = 'the activity recorded by staff in the system, narrowed by ' . $applied;
        }

        if ($count === 0) {
            $second = "It covers {$entries} ({$scope}), so there is no itemized list.";
        } else {
            $span = $first && $last
                ? ($first->isSameDay($last)
                    ? 'on ' . $first->format('F j, Y')
                    : 'from ' . ($this->dir === 'asc' ? $first : $last)->format('F j, Y') . ' to ' . ($this->dir === 'asc' ? $last : $first)->format('F j, Y'))
                : '';
            $second = "It covers {$entries} ({$scope}), written by {$staff} staff " . ($staff === 1 ? 'member' : 'members')
                . " in {$modules} " . ($modules === 1 ? 'module' : 'modules') . ", recorded {$span}, listed "
                . ($this->dir === 'asc' ? 'oldest' : 'newest') . ' first' . ($fieldList !== '' ? " with their {$fieldList}" : '') . '.';
        }

        return [
            "This Activity Log Report is prepared by the Barangay Piao office through the Piao Connect system to present the actions recorded by staff in the system as of {$printedOn}.",
            $second,
            "All information is taken directly from the activity log of Piao Connect as of {$printedOn} and is respectfully submitted for the information and guidance of the Barangay Council.",
        ];
    }

    /** "module Events; the date November 13, 2026; the search "scan"" -- only the filters actually on. */
    private function appliedFilterText(): string
    {
        $f = $this->filters;
        $parts = [];
        $type = $f['type'] ?? null;
        if ($type && $type !== 'all' && isset(ActivityLog::MODULE_FILTERS[$type])) {
            $parts[] = 'module ' . ActivityLog::MODULE_FILTERS[$type];
        }
        $day = fn (?string $v) => $v ? Carbon::parse($v, 'Asia/Manila')->format('F j, Y') : null;
        if (!empty($f['date'])) {
            $parts[] = 'the date ' . $day($f['date']);
        } elseif (!empty($f['date_from']) || !empty($f['date_to'])) {
            $parts[] = 'the dates ' . ($day($f['date_from'] ?? null) ?? 'the start') . ' to ' . ($day($f['date_to'] ?? null) ?? 'today');
        }
        $search = trim((string) ($f['search'] ?? ''));
        if ($search !== '') {
            $parts[] = 'the search "' . mb_substr($search, 0, 100) . '"';
        }

        return implode('; ', $parts);
    }
}

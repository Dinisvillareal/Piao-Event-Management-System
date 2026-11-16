<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Tests\Support;
use Tests\TestCase;

/**
 * The activity log: who may read it, that every filter returns exactly the right rows, that each
 * row remembers the device it came from, and that the CSV report holds the SAME rows as the
 * screen for the same filters, in one uniform layout.
 */
class ActivityLogTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    /** A log row with a chosen time (Manila time, as the app stores it). */
    private function log(string $module, string $description, string $at = '2026-11-13 10:00:00', string $action = 'Update', string $code = 'PR-900', ?string $ip = null): ActivityLog
    {
        $row = new ActivityLog();
        $row->forceFill([
            'user_code' => $code, 'action' => $action, 'module' => $module, 'description' => $description,
            'ip_address' => $ip, 'created_at' => $at, 'updated_at' => $at,
        ])->save();

        return $row;
    }

    private function ids(array $json): array
    {
        return collect($json['data'])->pluck('description')->all();
    }

    private function list(array $query = []): array
    {
        return $this->actingAs($this->staff())->getJson('/activity-logs?' . http_build_query($query))->assertOk()->json();
    }

    /** Parses the CSV text into rows (after the byte-order mark). */
    private function csv(string $text): array
    {
        $this->assertStringStartsWith("\xEF\xBB\xBF", $text, 'missing byte-order mark');
        $h = fopen('php://memory', 'w+');
        fwrite($h, substr($text, 3));
        rewind($h);
        $rows = [];
        while (($r = fgetcsv($h)) !== false) {
            $rows[] = $r;
        }
        fclose($h);

        return $rows;
    }

    private function export(array $query = [], $user = null)
    {
        return $this->actingAs($user ?? $this->staff())->get('/activity-logs/export/csv?' . http_build_query($query));
    }

    // ---------------------------------------------------------------- who may read it

    public function test_only_staff_can_read_or_export_the_log(): void
    {
        $this->log('Events', 'x');
        $resident = $this->makeUser('Resident');

        foreach (['/activity-logs', '/activity-logs/today', '/activity-logs/export/csv'] as $url) {
            $this->actingAs($resident)->getJson($url)->assertStatus(403);
        }
        auth()->logout();
        $this->getJson('/activity-logs')->assertStatus(401);
        $this->getJson('/activity-logs/export/csv')->assertStatus(401);
    }

    // ---------------------------------------------------------------- filters

    public function test_search_looks_in_description_action_module_and_staff_code(): void
    {
        $this->log('Events', 'Created event: Fiesta', action: 'Create', code: 'PR-111');
        $this->log('Budget', 'Recorded expense', action: 'Create', code: 'PR-222');
        $this->log('QR', 'Scanned someone', action: 'Time In', code: 'PR-333');

        $this->assertSame(['Created event: Fiesta'], $this->ids($this->list(['search' => 'fiesta'])));
        $this->assertSame(['Recorded expense'], $this->ids($this->list(['search' => 'PR-222'])));
        $this->assertSame(['Scanned someone'], $this->ids($this->list(['search' => 'time in'])));
        $this->assertSame(['Recorded expense'], $this->ids($this->list(['search' => 'Budget'])));
        $this->assertSame([], $this->ids($this->list(['search' => 'nothing like this'])));
    }

    public function test_percent_and_underscore_in_the_search_are_matched_literally(): void
    {
        $this->log('Budget', 'Budget used 100% of PHP 5,000');
        $this->log('Budget', 'Plain row');
        $this->log('Budget', 'Alpha_Beta');
        $this->log('Budget', 'AlphaXBeta');

        $this->assertSame(['Budget used 100% of PHP 5,000'], $this->ids($this->list(['search' => '%'])));
        $this->assertSame(['Alpha_Beta'], $this->ids($this->list(['search' => 'Alpha_Beta'])));
        $this->assertSame(['Alpha_Beta'], $this->ids($this->list(['search' => '_'])));
    }

    public function test_the_module_filter_returns_only_that_module_and_residents_include_old_rows(): void
    {
        $this->log('Events', 'e1');
        $this->log('Budget', 'b1');
        $this->log('User', 'u1');
        $this->log('Residents', 'u-old');
        $this->log('QR', 'q1');

        $this->assertSame(['e1'], $this->ids($this->list(['type' => 'event'])));
        $this->assertSame(['b1'], $this->ids($this->list(['type' => 'budget'])));
        $this->assertSame(['q1'], $this->ids($this->list(['type' => 'scan'])));
        $this->assertEqualsCanonicalizing(['u1', 'u-old'], $this->ids($this->list(['type' => 'resident'])));
        $this->assertCount(5, $this->ids($this->list(['type' => 'all'])));
        $this->assertCount(5, $this->ids($this->list(['type' => 'not-a-real-filter'])));
    }

    public function test_a_chosen_day_runs_from_midnight_up_to_but_not_including_the_next_midnight(): void
    {
        $this->log('Events', 'just before', '2026-11-12 23:59:59');
        $this->log('Events', 'midnight start', '2026-11-13 00:00:00');
        $this->log('Events', 'noon', '2026-11-13 12:00:00');
        $this->log('Events', 'last second', '2026-11-13 23:59:59');
        $this->log('Events', 'next midnight', '2026-11-14 00:00:00');

        $this->assertEqualsCanonicalizing(['midnight start', 'noon', 'last second'], $this->ids($this->list(['date' => '2026-11-13'])));
    }

    public function test_a_date_range_includes_both_end_days(): void
    {
        $this->log('Events', 'before', '2026-11-09 12:00:00');
        $this->log('Events', 'first day', '2026-11-10 08:00:00');
        $this->log('Events', 'middle', '2026-11-11 08:00:00');
        $this->log('Events', 'last day', '2026-11-12 23:00:00');
        $this->log('Events', 'after', '2026-11-13 00:00:00');

        $d = $this->list(['date_from' => '2026-11-10', 'date_to' => '2026-11-12', 'sort' => 'asc']);

        $this->assertSame(['first day', 'middle', 'last day'], $this->ids($d));
    }

    public function test_filters_combine_and_sort_order_works(): void
    {
        $this->log('Events', 'Fiesta created', '2026-11-13 09:00:00');
        $this->log('Events', 'Fiesta updated', '2026-11-13 11:00:00');
        $this->log('Budget', 'Fiesta expense', '2026-11-13 10:00:00');
        $this->log('Events', 'Fiesta created', '2026-11-12 09:00:00');

        $desc = $this->list(['search' => 'fiesta', 'type' => 'event', 'date' => '2026-11-13']);
        $this->assertSame(['Fiesta updated', 'Fiesta created'], $this->ids($desc));

        $asc = $this->list(['search' => 'fiesta', 'type' => 'event', 'date' => '2026-11-13', 'sort' => 'asc']);
        $this->assertSame(['Fiesta created', 'Fiesta updated'], $this->ids($asc));
    }

    public function test_the_list_is_paged_by_twenty_and_reports_the_total(): void
    {
        foreach (range(1, 45) as $i) {
            $this->log('Events', "row {$i}", '2026-11-13 10:00:00');
        }

        $page1 = $this->list();
        $page3 = $this->list(['page' => 3]);

        $this->assertSame(45, $page1['total']);
        $this->assertCount(20, $page1['data']);
        $this->assertCount(5, $page3['data']);
    }

    public function test_today_shows_only_todays_entries(): void
    {
        $this->log('Events', 'old', now()->subDays(3)->format('Y-m-d H:i:s'));
        $this->log('Events', 'fresh', now()->format('Y-m-d H:i:s'));

        $d = $this->actingAs($this->staff())->getJson('/activity-logs/today')->assertOk()->json();

        $this->assertSame(['fresh'], $this->ids($d));
    }

    // ---------------------------------------------------------------- the device it came from

    public function test_every_new_entry_remembers_the_ip_address_it_came_from(): void
    {
        $this->actingAs($this->staff())->postJson('/api/memberships', ['name' => 'Farmers'])->assertStatus(201);

        $row = ActivityLog::latest('id')->first();

        $this->assertNotNull($row);
        $this->assertSame('127.0.0.1', $row->ip_address);
    }

    public function test_the_search_and_date_columns_are_indexed(): void
    {
        $indexed = collect(Schema::getIndexes('activity_logs'))->pluck('columns')->map(fn ($c) => implode(',', $c))->all();

        $this->assertContains('created_at', $indexed);
        $this->assertContains('module,created_at', $indexed);
        $this->assertContains('user_code', $indexed);
        $this->assertTrue(Schema::hasColumn('activity_logs', 'ip_address'));
    }

    // ---------------------------------------------------------------- the CSV report

    public function test_the_csv_has_the_uniform_layout_title_filters_blank_line_headings_then_rows(): void
    {
        $staff = $this->staff(['first_name' => 'Ana', 'last_name' => 'Reyes']);
        $this->log('Events', 'Created event: Fiesta', '2026-11-13 09:30:00', 'Create', $staff->user_code, '192.168.1.20');

        $res = $this->export(['type' => 'event', 'date' => '2026-11-13'], $staff)->assertOk();
        $rows = $this->csv($res->streamedContent());

        $this->assertSame(['Activity Log Report'], $rows[0]);
        $this->assertSame('Module: Events · Date: November 13, 2026 · Newest first · 1 entry', $rows[1][0]);
        $this->assertStringStartsWith('Generated ', $rows[1][1]);
        $this->assertSame([null], $rows[2]);   // the blank separator line
        $this->assertSame(['No.', 'Date and time', 'Staff code', 'Staff name', 'Action', 'Module', 'Description', 'IP address'], $rows[3]);
        $this->assertSame(['1', '2026-11-13 09:30:00', $staff->user_code, 'Ana Reyes', 'Create', 'Events', 'Created event: Fiesta', '192.168.1.20'], $rows[4]);
        $this->assertCount(5, $rows);
        $this->assertStringContainsString('text/csv', $res->headers->get('Content-Type'));
        $this->assertMatchesRegularExpression('/activity-log-report-\d{8}\.csv/', $res->headers->get('Content-Disposition'));
    }

    public function test_the_csv_holds_every_matching_entry_not_just_one_page_of_them(): void
    {
        foreach (range(1, 45) as $i) {
            $this->log('Budget', "expense {$i}");
        }
        $this->log('Events', 'not a budget row');

        $rows = $this->csv($this->export(['type' => 'budget'])->streamedContent());

        $this->assertSame('Budget', $rows[4][5]);
        $this->assertCount(4 + 45, $rows);
        $this->assertStringContainsString('45 entries', $rows[1][0]);
    }

    public function test_the_csv_holds_exactly_the_rows_the_screen_shows_for_the_same_filters(): void
    {
        $this->log('Events', 'Fiesta created', '2026-11-13 09:00:00');
        $this->log('Events', 'Fiesta updated', '2026-11-13 11:00:00');
        $this->log('Budget', 'Fiesta expense', '2026-11-13 10:00:00');
        $this->log('Events', 'Fiesta created', '2026-11-12 09:00:00');
        $this->log('Events', 'Unrelated', '2026-11-13 12:00:00');

        foreach ([
            ['search' => 'fiesta'],
            ['search' => 'fiesta', 'type' => 'event'],
            ['search' => 'fiesta', 'type' => 'event', 'date' => '2026-11-13'],
            ['type' => 'event', 'date_from' => '2026-11-12', 'date_to' => '2026-11-12'],
            ['search' => 'fiesta', 'sort' => 'asc'],
            ['search' => 'zzz-nothing'],
        ] as $filters) {
            $screen = collect($this->list($filters + ['per_page' => 100])['data'])->pluck('description')->all();
            $csvRows = array_slice($this->csv($this->export($filters)->streamedContent()), 4);

            $this->assertSame($screen, array_column($csvRows, 6), 'screen and CSV differ for ' . json_encode($filters));
        }
    }

    public function test_the_csv_follows_the_chosen_sort_order(): void
    {
        $this->log('Events', 'first', '2026-11-13 08:00:00');
        $this->log('Events', 'second', '2026-11-13 09:00:00');

        $newest = array_column(array_slice($this->csv($this->export(['type' => 'event'])->streamedContent()), 4), 6);
        $oldest = array_column(array_slice($this->csv($this->export(['type' => 'event', 'sort' => 'asc'])->streamedContent()), 4), 6);

        $this->assertSame(['second', 'first'], $newest);
        $this->assertSame(['first', 'second'], $oldest);
    }

    public function test_a_report_with_no_matches_still_has_the_title_filters_and_headings(): void
    {
        $rows = $this->csv($this->export(['search' => 'nothing matches this'])->streamedContent());

        $this->assertCount(4, $rows);
        $this->assertSame('Search: "nothing matches this" · Newest first · 0 entries', $rows[1][0]);
        $this->assertSame('No.', $rows[3][0]);
    }

    public function test_the_filter_line_says_all_activity_when_nothing_is_filtered(): void
    {
        $this->log('Events', 'x');

        $rows = $this->csv($this->export()->streamedContent());

        $this->assertSame('All activity · Newest first · 1 entry', $rows[1][0]);
    }

    public function test_text_that_looks_like_a_spreadsheet_formula_is_defused(): void
    {
        $this->log('Events', '=HYPERLINK("http://evil.test","click")', action: '+cmd', code: '-1+1');
        $this->log('Events', '@SUM(A1)');

        $rows = array_slice($this->csv($this->export(['sort' => 'asc'])->streamedContent()), 4);

        $this->assertSame("'=HYPERLINK(\"http://evil.test\",\"click\")", $rows[0][6]);
        $this->assertSame("'+cmd", $rows[0][4]);
        $this->assertSame("'-1+1", $rows[0][2]);
        $this->assertSame("'@SUM(A1)", $rows[1][6]);
    }

    public function test_commas_quotes_and_line_breaks_in_a_description_stay_in_one_cell(): void
    {
        $this->log('Events', "Said \"hello\", then\nleft");

        $rows = array_slice($this->csv($this->export()->streamedContent()), 4);

        $this->assertCount(1, $rows);
        $this->assertSame("Said \"hello\", then\nleft", $rows[0][6]);
    }

    public function test_exporting_is_itself_logged_and_not_part_of_that_report(): void
    {
        $this->log('Events', 'one');
        $staff = $this->staff();

        $rows = array_slice($this->csv($this->export([], $staff)->streamedContent()), 4);

        $this->assertSame(['one'], array_column($rows, 6));
        $entry = ActivityLog::where('action', 'Export')->first();
        $this->assertNotNull($entry);
        $this->assertSame($staff->user_code, $entry->user_code);
        $this->assertSame('Reports', $entry->module);
        $this->assertStringContainsString('Activity Log Report', $entry->description);
        $this->assertStringContainsString('1 entry', $entry->description);
    }

    public function test_a_range_that_ends_before_it_starts_is_refused(): void
    {
        $this->actingAs($this->staff())
            ->getJson('/activity-logs/export/csv?date_from=2026-11-12&date_to=2026-11-01')
            ->assertStatus(422)->assertJsonValidationErrors('date_to');
        $this->actingAs($this->staff())->getJson('/activity-logs/export/csv?sort=sideways')->assertStatus(422);
    }

    // ---------------------------------------------------------------- Excel / PDF report (same table, drawn in the browser / by the server)

    private const ALL_COLUMNS = ['no', 'when', 'code', 'staff', 'action', 'module', 'description', 'ip'];

    private function excel(array $query = [], $user = null)
    {
        return $this->actingAs($user ?? $this->staff())
            ->getJson('/activity-logs/export/csv?' . http_build_query($query + ['as' => 'json', 'columns' => self::ALL_COLUMNS]));
    }

    private function pdf(array $body = [], $user = null)
    {
        return $this->actingAs($user ?? $this->staff())
            ->post('/activity-logs/export/pdf', $body + ['columns' => self::ALL_COLUMNS], ['Accept' => 'application/json']);
    }

    public function test_the_excel_report_holds_the_same_rows_as_the_screen_for_the_same_filters(): void
    {
        $this->log('Events', 'a', '2026-11-13 08:00:00', 'Create', 'PR-900', '10.0.0.1');
        $this->log('Budget', 'b', '2026-11-13 09:00:00');
        $this->log('Events', 'c', '2026-11-12 09:00:00');
        $filters = ['type' => 'event', 'date' => '2026-11-13'];

        $json = $this->excel($filters)->assertOk()->json();

        // columns: 0 no, 1 when, 2 code, 3 staff, 4 action, 5 module, 6 description, 7 ip
        $this->assertSame($this->ids($this->list($filters)), array_column($json['rows'], 6));
        $this->assertSame(['a'], array_column($json['rows'], 6));
        $this->assertSame('1', $json['rows'][0][0]);
        $this->assertSame('10.0.0.1', $json['rows'][0][7]);
        $this->assertSame('Nov 13, 2026 8:00 AM', $json['rows'][0][1]);
        $this->assertSame(1, $json['total']);
    }

    public function test_the_report_has_the_shape_the_browser_and_the_pdf_expect(): void
    {
        $this->log('Events', 'a');
        $this->log('Budget', 'b', '2026-11-13 11:00:00', 'Update', 'PR-901');

        $json = $this->excel(['type' => 'all', 'search' => 'a'])->assertOk()->json();

        foreach (['reportTitle', 'filterSummary', 'printedOn', 'generatedAt', 'message', 'officials', 'columns', 'rows', 'total'] as $key) {
            $this->assertArrayHasKey($key, $json);
        }
        $this->assertSame('Activity Log Report', $json['reportTitle']);
        $this->assertSame(self::ALL_COLUMNS, array_column($json['columns'], 'key'));
        $this->assertSame(['No.', 'Date and time', 'Staff code', 'Staff name', 'Action', 'Module', 'Description', 'IP address'], array_column($json['columns'], 'label'));
        $this->assertCount(count($json['columns']), $json['rows'][0]);
        $this->assertSame(count($json['rows']), $json['total']);
    }

    public function test_only_the_chosen_columns_come_back_in_print_order_and_rows_follow_them(): void
    {
        $this->log('Events', 'a', '2026-11-13 08:00:00', 'Create', 'PR-900', '10.0.0.1');

        // ticked in a jumbled order, with a duplicate: printed in the fixed order, once
        $json = $this->excel(['type' => 'event', 'columns' => ['description', 'no', 'action', 'no']])->assertOk()->json();

        $this->assertSame(['no', 'action', 'description'], array_column($json['columns'], 'key'));
        $this->assertSame([['1', 'Create', 'a']], $json['rows']);
        // the message only lists what is actually in the file
        $this->assertStringContainsString('with their action and description', $json['message'][1]);
        $this->assertStringNotContainsString('IP address', implode(' ', $json['message']));
    }

    public function test_a_report_needs_between_three_and_all_columns_and_only_known_ones(): void
    {
        $staff = $this->staff();
        foreach ([['no', 'when'], ['no', 'when', 'code', 'secret'], []] as $columns) {
            $this->actingAs($staff)->getJson('/activity-logs/export/csv?' . http_build_query(['as' => 'json', 'columns' => $columns]))
                ->assertStatus(422)->assertJsonValidationErrors($columns ? ($columns === ['no', 'when'] ? 'columns' : 'columns.3') : 'columns');
        }
        $this->actingAs($staff)->getJson('/activity-logs/export/csv?as=json')->assertStatus(422)->assertJsonValidationErrors('columns');
        $this->pdf(['columns' => ['no', 'when']], $staff)->assertStatus(422)->assertJsonValidationErrors('columns');
        // the plain CSV does not need them
        $this->export([], $staff)->assertOk();
    }

    public function test_the_message_can_be_left_out_and_is_included_by_default(): void
    {
        $this->log('Events', 'a');

        // (type=event keeps the log entries written by the earlier exports out of the comparison)
        $with = $this->excel(['type' => 'event'])->assertOk()->json('message');
        $without = $this->excel(['type' => 'event', 'message' => 0])->assertOk()->json('message');
        $explicit = $this->excel(['type' => 'event', 'message' => 1])->assertOk()->json('message');

        $this->assertCount(3, $with);
        $this->assertSame($with, $explicit);
        $this->assertSame([], $without);
        $this->assertStringContainsString('written by 1 staff member in 1 module', $with[1]);
        $this->assertStringContainsString('covers 1 entry', $with[1]);
    }

    public function test_the_excel_signature_names_come_from_the_current_officials(): void
    {
        $this->makeUser('Resident', ['first_name' => 'Librado', 'last_name' => 'Magcanta', 'barangay_position' => 'captain']);

        $json = $this->excel()->assertOk()->json();

        $this->assertStringContainsString('MAGCANTA', strtoupper($json['officials']['captain']['name']));
        $this->assertNull($json['officials']['secretary'] ?? null);
    }

    public function test_an_empty_report_is_still_valid(): void
    {
        $json = $this->excel(['search' => 'nothing matches this'])->assertOk()->json();

        $this->assertSame([], $json['rows']);
        $this->assertSame(0, $json['total']);
        $this->assertStringContainsString('0 entries', $json['filterSummary']);
        $this->assertStringContainsString('no itemized list', $json['message'][1]);
    }

    public function test_the_message_names_the_span_in_the_order_it_is_listed(): void
    {
        $this->log('Events', 'a', '2026-11-01 08:00:00');
        $this->log('Events', 'b', '2026-11-09 18:30:00');

        foreach (['asc' => 'oldest first', 'desc' => 'newest first'] as $dir => $words) {
            $msg = $this->excel(['type' => 'event', 'sort' => $dir])->assertOk()->json('message')[1];
            $this->assertStringContainsString('from November 1, 2026 to November 9, 2026', $msg, $dir);
            $this->assertStringContainsString($words, $msg, $dir);
        }
        $rows = $this->excel(['type' => 'event', 'sort' => 'asc'])->json('rows');
        $this->assertSame(['a', 'b'], array_column($rows, 6));
    }

    public function test_a_quick_period_narrows_the_report_and_the_screen_and_an_explicit_date_wins(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-11-14 12:00:00', 'Asia/Manila'));
        try {
            $this->log('Events', 'today', '2026-11-14 09:00:00');
            $this->log('Events', 'three days ago', '2026-11-11 09:00:00');
            // the edges: the 7-day period is today and the 6 days before it, the 30-day one today and the 29 before
            $this->log('Events', 'six days ago', '2026-11-08 00:00:00');
            $this->log('Events', 'seven days ago', '2026-11-07 23:59:59');
            $this->log('Events', 'twenty-nine days ago', '2026-10-16 00:00:00');
            $this->log('Events', 'thirty days ago', '2026-10-15 23:59:59');
            $this->log('Events', 'forty days ago', '2026-10-05 09:00:00');

            $descriptions = fn (string $period, array $extra = []) => array_column($this->excel(['type' => 'event', 'period' => $period] + $extra)->assertOk()->json('rows'), 6);

            $this->assertSame(['today'], $descriptions('today'));
            $this->assertSame(['today', 'three days ago', 'six days ago'], $descriptions('7d'));
            $this->assertSame(['today', 'three days ago', 'six days ago', 'seven days ago', 'twenty-nine days ago'], $descriptions('30d'));
            $this->assertCount(7, $descriptions('all'));
            // the screen's count uses the same period, so the dialog can show "N entries" before exporting
            $this->assertSame(3, $this->list(['type' => 'event', 'period' => '7d'])['total']);
            // a chosen day beats the period
            $this->assertSame(['forty days ago'], $descriptions('7d', ['date' => '2026-10-05']));
            $this->assertSame(['forty days ago'], $descriptions('today', ['date' => '2026-10-05']));
        } finally {
            \Carbon\Carbon::setTestNow();
        }
    }

    public function test_an_unknown_period_is_refused(): void
    {
        $this->excel(['period' => 'forever'])->assertStatus(422)->assertJsonValidationErrors('period');
        $this->actingAs($this->staff())->getJson('/activity-logs?period=forever')->assertStatus(422);
    }

    public function test_the_excel_report_is_refused_when_it_would_be_too_big_and_the_csv_is_not(): void
    {
        $now = now()->toDateTimeString();
        $rows = [];
        for ($i = 0; $i < \App\Support\ActivityLogReport::EXCEL_MAX_ROWS + 1; $i++) {
            $rows[] = ['user_code' => 'PR-900', 'action' => 'Update', 'module' => 'Events', 'description' => "row {$i}", 'created_at' => $now, 'updated_at' => $now];
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            ActivityLog::insert($chunk);
        }

        $this->excel()->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'one Excel file') && str_contains($m, 'Narrow the filters'));
        $this->pdf()->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'one PDF file') && str_contains($m, 'Narrow the filters to 2,000 entries'));
        $this->export()->assertOk();
        $this->excel(['search' => 'row 1000'])->assertOk();
        $this->pdf(['search' => 'row 1000'])->assertOk();
        // fewer columns, more rows: the limit is on rows x columns
        $this->assertSame(2000, \App\Support\ActivityLogReport::pdfMaxRows(8));
        $this->assertSame(5333, \App\Support\ActivityLogReport::pdfMaxRows(3));
        $this->pdf(['columns' => ['no', 'action', 'description'], 'search' => 'row 1000'])->assertOk();
    }

    public function test_an_export_is_logged_with_its_format(): void
    {
        $this->log('Events', 'one');
        $staff = $this->staff();

        $this->excel([], $staff)->assertOk();
        $this->pdf([], $staff)->assertOk();
        $this->export([], $staff)->assertOk();

        $logged = ActivityLog::where('action', 'Export')->orderBy('id')->pluck('description')->all();
        $this->assertCount(3, $logged);
        $this->assertStringContainsString('as Excel', $logged[0]);
        $this->assertStringContainsString('as PDF', $logged[1]);
        $this->assertStringContainsString('as CSV', $logged[2]);
        $this->assertSame($staff->user_code, ActivityLog::where('action', 'Export')->first()->user_code);
    }

    public function test_the_pdf_is_a_real_pdf_with_the_report_in_it(): void
    {
        $this->log('Events', 'Opened the scan window', '2026-11-13 08:00:00', 'Create', 'PR-900', '10.0.0.1');

        $response = $this->pdf(['type' => 'event'])->assertOk();

        $this->assertSame('application/pdf', $response->headers->get('content-type'));
        $this->assertStringContainsString('activity-log-report-', $response->headers->get('content-disposition'));
        $this->assertStringStartsWith('%PDF', $response->getContent());
    }

    public function test_the_pdf_page_lists_the_chosen_columns_the_message_and_the_signatures(): void
    {
        $this->makeUser('Resident', ['first_name' => 'Librado', 'last_name' => 'Magcanta', 'barangay_position' => 'captain']);
        $this->log('Events', 'Opened the scan window');
        $data = (new \App\Support\ActivityLogReport(['type' => 'event'], 'desc', ['no', 'description', 'action'], true))->build();

        $html = view('activity_logs.export', [
            'columns' => array_column($data['columns'], 'label'), 'widths' => [10, 30, 60], 'centered' => [0],
            'rows' => $data['rows'], 'message' => $data['message'], 'filterSummary' => $data['filterSummary'],
            'officials' => $data['officials'], 'printedOn' => $data['printedOn'],
        ])->render();

        foreach (['Activity Log Report', 'I.', 'MESSAGE', 'ACTIVITY LOG', 'Opened the scan window', 'Barangay Captain', 'Prepared by:'] as $needle) {
            $this->assertStringContainsString($needle, $html);
        }
        $this->assertStringNotContainsString('IP address', $html);

        $without = view('activity_logs.export', [
            'columns' => ['No.'], 'widths' => [100], 'centered' => [0], 'rows' => [], 'message' => [],
            'filterSummary' => '', 'officials' => [], 'printedOn' => 'today',
        ])->render();
        $this->assertStringNotContainsString('MESSAGE', $without);
        $this->assertStringContainsString('No activity matches', $without);
    }

    private function pdfHtml(int $rowCount, int $chunkSize = 100): string
    {
        $rows = array_map(fn ($i) => [(string) $i, 'Update', "row {$i}"], range(1, $rowCount));

        return view('activity_logs.export', [
            'columns' => ['No.', 'Action', 'Description'], 'widths' => [10, 20, 70], 'centered' => [0], 'rows' => $rows,
            'chunkSize' => $chunkSize, 'message' => [], 'filterSummary' => '', 'officials' => [], 'printedOn' => 'today',
        ])->render();
    }

    public function test_the_pdf_reads_as_one_table_with_no_part_labels_or_forced_page_breaks(): void
    {
        $html = $this->pdfHtml(250);

        // laid out in flush pieces (cheap on memory) but only the first carries the header row
        $this->assertSame(3, substr_count($html, '<table class="list'));
        $this->assertSame(1, substr_count($html, '<tr class="head">'));
        $this->assertSame(0, substr_count($html, '<thead>'));
        $this->assertSame(2, substr_count($html, 'class="list cont"'));
        $this->assertStringNotContainsString('Part 1 of', $html);
        $this->assertStringNotContainsString('page-break-before', $html);
        // numbering and striping run straight on: the first row of the second piece is entry 101
        $this->assertStringContainsString('row 101', $html);
        $this->assertStringContainsString('row 250', $html);
        $this->assertStringContainsString('<tr class="alt">', $html);
        // a short report is a single plain table
        $this->assertSame(1, substr_count($this->pdfHtml(100), '<table class="list'));
    }

    public function test_the_pdf_has_its_column_header_exactly_once_on_every_page(): void
    {
        if (!trim((string) shell_exec('command -v pdftotext pdfinfo 2>/dev/null'))) {
            $this->markTestSkipped('pdftotext is not installed here.');
        }
        $staff = $this->staff();
        // more rows than one drawn piece (100), with a long description so each row wraps and the report runs to many pages
        $now = now()->toDateTimeString();
        $rows = [];
        for ($i = 1; $i <= 230; $i++) {
            $rows[] = ['user_code' => 'PR-900', 'action' => 'Update', 'module' => 'Events', 'description' => "entry {$i} " . str_repeat('long text ', 12), 'created_at' => $now, 'updated_at' => $now];
        }
        ActivityLog::insert($rows);

        $content = $this->pdf(['type' => 'event', 'columns' => ['no', 'action', 'description']], $staff)->assertOk()->getContent();
        $file = tempnam(sys_get_temp_dir(), 'alog') . '.pdf';
        file_put_contents($file, $content);
        try {
            $pages = (int) preg_replace('~\D~', '', (string) shell_exec('pdfinfo ' . escapeshellarg($file) . ' | grep ^Pages:'));
            $this->assertGreaterThan(3, $pages);
            $headers = 0;
            for ($p = 1; $p <= $pages; $p++) {
                $text = (string) shell_exec('pdftotext -f ' . $p . ' -l ' . $p . ' ' . escapeshellarg($file) . ' - 2>/dev/null');
                $headers += substr_count($text, 'DESCRIPTION');
            }
            $this->assertSame($pages, $headers, 'every page, first to last, shows the column header exactly once');
        } finally {
            @unlink($file);
        }
    }

    public function test_the_chunk_size_is_a_hundred_rows(): void
    {
        $this->assertSame(100, \App\Support\ActivityLogReport::PDF_CHUNK_ROWS);
    }

    public function test_a_resident_cannot_get_the_excel_or_pdf_report(): void
    {
        $resident = $this->makeUser('Resident');
        $this->actingAs($resident)->getJson('/activity-logs/export/csv?as=json&columns[]=no&columns[]=when&columns[]=code')->assertStatus(403);
        $this->pdf([], $resident)->assertStatus(403);
    }

    public function test_a_guest_cannot_get_the_pdf(): void
    {
        $this->postJson('/activity-logs/export/pdf', ['columns' => self::ALL_COLUMNS])->assertStatus(401);
    }
}

<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * generated_reports.format and activity_logs.module only hold the words the system
 * knows, enforced by the database (migration 2026_11_19_000010).
 */
class ReportFormatAndLogModuleLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000010_lock_report_format_and_log_module.php');
    }

    private function report(string $format): int
    {
        return DB::table('generated_reports')->insertGetId([
            'user_code' => 'PR-0001', 'type' => 'budget', 'format' => $format, 'title' => 'Budget Summary Report',
        ]);
    }

    private function log(string $module): int
    {
        return DB::table('activity_logs')->insertGetId([
            'user_code' => 'PR-0001', 'action' => 'Test', 'module' => $module, 'description' => 'x',
        ]);
    }

    private function refused(callable $write, string $why): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString($why, $e->getMessage(), 'refused, but not by the expected rule');

            return;
        }
        $this->fail("The database accepted a bad value ({$why})");
    }

    public function test_a_report_format_must_be_print_pdf_word_or_csv(): void
    {
        foreach (['print', 'pdf', 'word', 'csv'] as $format) {
            $this->report($format);
        }
        $this->assertSame(4, DB::table('generated_reports')->count());

        foreach (['excel', 'PDFs', '', ' ', 'docx'] as $bad) {
            $this->refused(fn () => $this->report($bad), 'Report format is not recognised');
        }
        $this->assertSame(4, DB::table('generated_reports')->count());
    }

    public function test_changing_a_report_format_to_a_bad_word_is_refused(): void
    {
        $id = $this->report('pdf');

        $this->withoutTimeLocks(function () use ($id) {   // the report history is add-only, so the edits are tried with that lock lifted
            $this->refused(fn () => DB::table('generated_reports')->where('id', $id)->update(['format' => 'excel']), 'Report format is not recognised');
            DB::table('generated_reports')->where('id', $id)->update(['format' => 'csv']);
            $this->assertSame('csv', DB::table('generated_reports')->where('id', $id)->value('format'));
        });
    }

    public function test_an_activity_log_module_must_be_one_the_system_writes(): void
    {
        foreach (['Archive', 'Authentication', 'Budget', 'Events', 'Feedback', 'Households', 'Inventory', 'Membership', 'Notifications', 'Profiling Settings', 'QR', 'Reports', 'Residents', 'Settings', 'Staff Accounts', 'System', 'User'] as $module) {
            $this->log($module);
        }
        $this->assertSame(17, DB::table('activity_logs')->count());

        foreach (['Payroll', 'Events2', '', ' ', 'Event'] as $bad) {
            $this->refused(fn () => $this->log($bad), 'Activity log module is not recognised');
        }
        $this->assertSame(17, DB::table('activity_logs')->count());
    }

    public function test_changing_a_log_module_to_a_bad_word_is_refused_but_other_edits_are_fine(): void
    {
        $id = $this->log('Events');

        $this->withoutTimeLocks(function () use ($id) {   // the log is add-only, so the edits are tried with that lock lifted
            $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['module' => 'Payroll']), 'Activity log module is not recognised');
            DB::table('activity_logs')->where('id', $id)->update(['description' => 'changed']);
            $this->assertSame('changed', DB::table('activity_logs')->where('id', $id)->value('description'));
        });
    }

    public function test_every_module_name_the_application_writes_is_allowed(): void
    {
        $allowed = $this->migration()::LOG_MODULES;
        $found = [];

        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path())) as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            $code = file_get_contents($file->getPathname());
            // 3-argument createLog($action, 'Module', ...), 'module' => 'Module', and $logModule = 'Module'
            preg_match_all("/createLog\(\s*'[^']*'\s*,\s*'([^']+)'\s*,/", $code, $a);
            preg_match_all("/'module'\s*=>\s*'([^']+)'/", $code, $b);
            preg_match_all("/\\\$logModule\s*=\s*'([^']+)'/", $code, $c);
            $found = array_merge($found, $a[1], $b[1], $c[1]);
        }
        $found = array_unique(array_merge($found, array_values(ActivityLog::MODULE_FILTERS)));

        $this->assertNotEmpty($found);
        $this->assertSame([], array_values(array_diff($found, $allowed)), 'the application writes a module the database would refuse');
    }

    public function test_the_migration_stops_and_changes_nothing_when_stored_rows_already_break_a_rule(): void
    {
        $m = $this->migration();
        $m->down();
        $this->report('excel');
        $this->log('Payroll');

        try {
            $m->up();
            $this->fail('The migration should have stopped.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('generated_reports (format_values)', $e->getMessage());
            $this->assertStringContainsString('activity_logs (module_values)', $e->getMessage());
            $this->assertStringContainsString("'Payroll'", $e->getMessage());   // names the value so it can be fixed
            $this->assertStringContainsString("'excel'", $e->getMessage());
        }

        // nothing was locked, so both bad rows are still there and bad values are still accepted
        $this->assertSame(1, DB::table('generated_reports')->where('format', 'excel')->count());
        $this->report('docx');
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->down();
        $this->report('excel');                       // allowed while unlocked
        $this->log('Payroll');
        $this->withoutTimeLocks(function () {
            DB::table('generated_reports')->delete();
            DB::table('activity_logs')->delete();
        });
        $m->up();
        $m->down();
        $m->up();

        $this->refused(fn () => $this->report('excel'), 'Report format is not recognised');
        $this->refused(fn () => $this->log('Payroll'), 'Activity log module is not recognised');
    }
}

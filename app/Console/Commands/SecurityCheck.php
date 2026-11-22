<?php

namespace App\Console\Commands;

use App\Support\AuditChain;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One command that says whether this installation is set up safely. It only reads.
 *
 *   php artisan security:check
 *
 * FAIL = fix before going live (the command then exits with an error); WARN = worth fixing; OK = fine.
 */
class SecurityCheck extends Command
{
    protected $signature = 'security:check';

    protected $description = 'Check the settings, the database account, the database locks and the log fingerprints for safety problems';

    /** @var array<int, array{0:string,1:string,2:string}> */
    private array $results = [];

    public function handle(): int
    {
        $this->settings();
        $this->databaseAccount();
        $this->locks();
        $this->fingerprints();
        $this->attendance();

        $this->table(['', 'Check', 'Detail'], array_map(fn ($r) => $r, $this->results));
        $failed = count(array_filter($this->results, fn ($r) => $r[0] === 'FAIL'));
        $warned = count(array_filter($this->results, fn ($r) => $r[0] === 'WARN'));
        $this->line($failed ? "{$failed} problem(s) to fix." : ($warned ? "No failures; {$warned} warning(s)." : 'All checks passed.'));

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function add(string $level, string $check, string $detail = ''): void
    {
        $this->results[] = [$level, $check, $detail];
    }

    private function settings(): void
    {
        config('app.debug') ? $this->add('FAIL', 'Debug mode is off', 'APP_DEBUG is true: error pages would show code and settings. Set APP_DEBUG=false.') : $this->add('OK', 'Debug mode is off');
        strlen((string) config('app.key')) > 10 ? $this->add('OK', 'Application key is set') : $this->add('FAIL', 'Application key is set', 'Run php artisan key:generate.');
        config('app.env') === 'production' ? $this->add('OK', 'Environment is production') : $this->add('WARN', 'Environment is production', 'APP_ENV is "' . config('app.env') . '".');

        $https = str_starts_with((string) config('app.url'), 'https://');
        if ($https) {
            config('session.secure') ? $this->add('OK', 'Session cookie only over https') : $this->add('FAIL', 'Session cookie only over https', 'Set SESSION_SECURE_COOKIE=true.');
        } else {
            $this->add('WARN', 'Site is served over https', 'APP_URL is not https; passwords and sessions travel unencrypted outside a closed network.');
        }
        config('session.http_only') ? $this->add('OK', 'Session cookie hidden from scripts') : $this->add('FAIL', 'Session cookie hidden from scripts', 'Set SESSION_HTTP_ONLY=true.');
        in_array(strtolower((string) config('session.same_site')), ['lax', 'strict'], true) ? $this->add('OK', 'Session cookie same-site') : $this->add('FAIL', 'Session cookie same-site', 'Set SESSION_SAME_SITE=lax.');
        (int) config('session.lifetime') <= 240 ? $this->add('OK', 'Session expires after inactivity') : $this->add('WARN', 'Session expires after inactivity', config('session.lifetime') . ' minutes is long.');
        (int) config('hashing.bcrypt.rounds', 12) >= 12 ? $this->add('OK', 'Password hashing cost') : $this->add('WARN', 'Password hashing cost', 'BCRYPT_ROUNDS is below 12.');

        $own = (string) env('AUDIT_LOG_KEY');
        $own !== '' && $own !== (string) config('app.key')
            ? $this->add('OK', 'Log fingerprint key is separate', 'AUDIT_LOG_KEY differs from APP_KEY.')
            : $this->add('WARN', 'Log fingerprint key is separate', 'Set AUDIT_LOG_KEY so that changing APP_KEY never breaks the fingerprints, and keep a copy of it outside the database.');
    }

    private function databaseAccount(): void
    {
        $driver = DB::getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            $this->add('WARN', 'Database account is restricted', "Not checked on {$driver}.");

            return;
        }
        try {
            $grants = collect(DB::select('SHOW GRANTS FOR CURRENT_USER()'))->map(fn ($r) => (string) array_values((array) $r)[0])->implode("\n");
        } catch (\Throwable $e) {
            $this->add('WARN', 'Database account is restricted', 'The grants could not be read.');

            return;
        }
        $broad = preg_match('/ALL PRIVILEGES|\bTRIGGER\b|\bALTER\b|\bDROP\b|\bCREATE\b/i', $grants);
        $broad
            ? $this->add('FAIL', 'Database account is restricted', 'The account can change tables or triggers, so it could remove the locks. Create a limited account with php artisan db:grants and use it in .env.')
            : $this->add('OK', 'Database account is restricted', 'It cannot alter tables or triggers.');
    }

    private function locks(): void
    {
        $names = $this->triggerNames();
        $need = ['activity_logs_append_only_update', 'activity_logs_append_only_delete', 'generated_reports_append_only_update', 'inventory_unit_logs_ledger_core_update', 'attendance_scans_append_only_update', 'attendance_scans_append_only_delete', 'attendances_scanned_row_delete_lock', 'attendances_status_follows_times_update', 'users_deleted_at_lock'];
        $missing = array_values(array_diff($need, $names));
        $missing
            ? $this->add('FAIL', 'Database locks are in place', 'Missing: ' . implode(', ', $missing) . '. Run php artisan migrate.')
            : $this->add('OK', 'Database locks are in place', count($names) . ' triggers found.');
    }

    /** @return string[] */
    private function triggerNames(): array
    {
        if (DB::getDriverName() === 'sqlite') {
            return array_map(fn ($r) => $r->name, DB::select("SELECT name FROM sqlite_master WHERE type = 'trigger'"));
        }

        return array_map(fn ($r) => $r->TRIGGER_NAME, DB::select('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()'));
    }

    private function attendance(): void
    {
        if (! Schema::hasTable('attendance_scans')) {
            $this->add('FAIL', 'Attendance matches the scan ledger', 'The scan ledger is missing. Run php artisan migrate.');

            return;
        }
        $n = count(\App\Support\AttendanceLedger::check());
        $n
            ? $this->add('FAIL', 'Attendance matches the scan ledger', "{$n} row(s) differ. Run php artisan attendance:reconcile for the details.")
            : $this->add('OK', 'Attendance matches the scan ledger', 'Every attendance row agrees with its scans.');
    }

    private function fingerprints(): void
    {
        $bad = [];
        foreach (array_keys(AuditChain::TABLES) as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'row_hash')) {
                $bad[] = "{$table} (no fingerprint column)";

                continue;
            }
            if (AuditChain::check($table)['problems'] ?? false) {
                $bad[] = $table;
            }
        }
        $bad
            ? $this->add('FAIL', 'Log fingerprints are intact', 'Check: ' . implode(', ', $bad) . '. Run php artisan log:verify for the exact rows.')
            : $this->add('OK', 'Log fingerprints are intact', 'Activity log, report history, inventory ledger and attendance scan ledger verify.');
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Two more "allowed words" rules, enforced by the database itself so that no route,
 * script or manual edit can save a value the system does not know:
 *
 *   generated_reports.format   print, pdf, word or csv (the four ways a report is produced)
 *   activity_logs.module       one of the modules the system writes to the activity log
 *                              ("Residents" and "Settings" are names older rows were saved under)
 *
 * A text column with a CHECK is used instead of ENUM: it works the same on MySQL,
 * MariaDB and SQLite, and adding a value later is a small migration, not a column rewrite.
 *
 * Before adding anything the migration checks every stored row; if some already break a
 * rule it stops, changes NOTHING and lists them. MySQL 8.0.16+ and MariaDB 10.2.1+ get
 * CHECK constraints; older MySQL (which ignores CHECK) and SQLite get triggers instead.
 */
return new class extends Migration
{
    /** Every module name the application writes to activity_logs.module. */
    public const LOG_MODULES = [
        'Archive', 'Authentication', 'Budget', 'Events', 'Feedback', 'Households', 'Inventory',
        'Membership', 'Notifications', 'Profiling Settings', 'QR', 'Reports', 'Residents',
        'Settings', 'Staff Accounts', 'System', 'User',
    ];

    public const REPORT_FORMATS = ['print', 'pdf', 'word', 'csv'];

    /** [table, key, columns used, condition for a VALID row (mysql, sqlite), message]. {col} marks a column. */
    private function rules(): array
    {
        $list = fn (array $words) => "'" . implode("','", $words) . "'";

        return [
            ['generated_reports', 'format_values', ['format'], "{format} IN ({$list(self::REPORT_FORMATS)})", 'Report format is not recognised.'],
            ['activity_logs', 'module_values', ['module'], "{module} IN ({$list(self::LOG_MODULES)})", 'Activity log module is not recognised.'],
        ];
    }

    public function up(): void
    {
        $this->assertStoredRowsAreValid();

        foreach ($this->rules() as [$table, $key, $columns, $condition, $message]) {
            $this->lock($table, $key, $columns, $condition, $message);
        }
    }

    public function down(): void
    {
        foreach ($this->rules() as [$table, $key]) {
            $this->unlock($table, $key);
        }
    }

    // ------------------------------------------------------------------ pre-flight

    private function assertStoredRowsAreValid(): void
    {
        $problems = [];

        foreach ($this->rules() as [$table, $key, $columns, $condition, $message]) {
            $where = 'NOT (' . $this->expr($condition, '') . ')';
            $count = DB::table($table)->whereRaw($where)->count();
            if ($count === 0) {
                continue;
            }
            $ids = DB::table($table)->whereRaw($where)->orderBy('id')->limit(5)->pluck('id')->all();
            $values = DB::table($table)->whereRaw($where)->distinct()->limit(5)->pluck($columns[0])->map(fn ($v) => "'" . $v . "'")->implode(', ');
            $problems[] = "{$table} ({$key}): {$count} row(s), e.g. #" . implode(', #', $ids) . " -- {$message} Found: {$values}.";
        }

        if ($problems) {
            throw new RuntimeException(
                "Cannot lock these rules: some stored rows already break them. Correct these rows and run the migration again; nothing was changed.\n  "
                . implode("\n  ", $problems)
            );
        }
    }

    // ------------------------------------------------------------------ building SQL

    /** The valid-condition for this database, with {col} turned into `col` (or NEW.`col`). */
    private function expr(string|array $condition, string $prefix): string
    {
        if (is_array($condition)) {
            $condition = DB::getDriverName() === 'sqlite' ? $condition[1] : $condition[0];
        }

        return preg_replace('/\{([a-z_]+)\}/', $prefix . '`$1`', $condition);
    }

    private function lock(string $table, string $key, array $columns, string|array $condition, string $message): void
    {
        $name = "{$table}_{$key}_chk";
        $new  = $this->expr($condition, 'NEW.');

        if (DB::getDriverName() === 'sqlite') {
            $of = implode(', ', array_map(fn ($c) => "`{$c}`", $columns));
            DB::unprepared("CREATE TRIGGER {$name}_insert BEFORE INSERT ON {$table} FOR EACH ROW WHEN NOT ({$new}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            DB::unprepared("CREATE TRIGGER {$name}_update BEFORE UPDATE OF {$of} ON {$table} FOR EACH ROW WHEN NOT ({$new}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        if ($this->supportsCheck()) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK (" . $this->expr($condition, '') . ')');
            return;
        }

        foreach (['insert' => 'BEFORE INSERT', 'update' => 'BEFORE UPDATE'] as $suffix => $event) {
            DB::unprepared("CREATE TRIGGER {$name}_{$suffix} {$event} ON {$table} FOR EACH ROW BEGIN IF NOT ({$new}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
        }
    }

    private function unlock(string $table, string $key): void
    {
        $name = "{$table}_{$key}_chk";

        if (DB::getDriverName() !== 'sqlite' && $this->supportsCheck()) {
            try {
                $how = $this->isMariaDb() || version_compare($this->versionNumber(), '8.0.19', '>=') ? 'CONSTRAINT' : 'CHECK';
                DB::statement("ALTER TABLE {$table} DROP {$how} {$name}");
            } catch (Throwable $e) {
                // already gone
            }
            return;
        }

        DB::unprepared("DROP TRIGGER IF EXISTS {$name}_insert");
        DB::unprepared("DROP TRIGGER IF EXISTS {$name}_update");
    }

    // ------------------------------------------------------------------ server version

    private function version(): string
    {
        return (string) DB::scalar('SELECT VERSION()');
    }

    private function isMariaDb(): bool
    {
        return stripos($this->version(), 'mariadb') !== false;
    }

    private function versionNumber(): string
    {
        $v = preg_replace('/^5\.5\.5-/', '', $this->version());   // MariaDB's replication-compatible prefix
        preg_match('/\d+\.\d+\.\d+/', $v, $m);

        return $m[0] ?? '0.0.0';
    }

    private function supportsCheck(): bool
    {
        return $this->isMariaDb()
            ? version_compare($this->versionNumber(), '10.2.1', '>=')
            : version_compare($this->versionNumber(), '8.0.16', '>=');
    }
};

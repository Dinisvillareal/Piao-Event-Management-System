<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * More rules the database enforces by itself, so a bad value cannot be saved by
 * a forgotten form rule, a script, an import or a manual edit:
 *
 *   Blank text      event name and location, inventory item name, and a
 *                   resident's first and last name cannot be empty or only spaces
 *   Birth date      not before 1900-01-01 and not in the future
 *   Event date      an event cannot start before 2020-01-01 or more than 3 years
 *                   from today
 *   Yes/no flags    every on/off column holds only 0 or 1
 *   SMS number      sms_logs.to_number is 09XXXXXXXXX or 639XXXXXXXXX, like every
 *                   other phone column
 *   Archived by     "who archived it" can never be an empty string
 *
 * The two rules that depend on today's date ("not in the future", "not more than
 * 3 years ahead") can only be triggers, because a CHECK may not use the clock.
 * They judge a row when it is added or when that date is changed, so a record
 * saved earlier never blocks an unrelated edit as time passes.
 *
 * Before adding anything the migration checks every stored row against the fixed
 * rules; if some already break one it stops, changes NOTHING and lists them.
 *
 * MySQL 8.0.16+ and MariaDB 10.2.1+ get CHECK constraints. Older MySQL, which
 * silently ignores CHECK, and SQLite (used by the tests) get triggers instead.
 */
return new class extends Migration
{
    private const ARCHIVE_TABLES = [
        'events', 'event_expenses', 'age_brackets', 'civil_statuses', 'households',
        'current_statuses', 'users', 'inventory_items', 'feedback', 'memberships',
    ];

    /** table => yes/no columns */
    private const FLAGS = [
        'events'               => ['posted_to_facebook'],
        'notifications'        => ['is_updated', 'read'],
        'security_alerts'      => ['read'],
        'integration_settings' => ['is_enabled'],
        'users'                => ['has_account', 'is_household_head', 'is_head_staff', 'must_change_password'],
        'memberships'          => ['is_active'],
    ];

    /** Fixed rules: [table, key, columns used, condition for a VALID row (mysql, sqlite), message]. {col} marks a column. */
    private function rules(): array
    {
        // empty, spaces, tabs or line breaks only
        $blank = fn (string $c) => [
            "{{$c}} NOT REGEXP '^[[:space:]]*\$'",
            "trim({{$c}}, ' ' || char(9) || char(10) || char(13)) <> ''",
        ];
        $digits = str_repeat('[0-9]', 9);
        $rules = [
            ['events', 'name_not_blank', ['name'], $blank('name'), 'Event name cannot be blank.'],
            ['events', 'location_not_blank', ['location'], $blank('location'), 'Event location cannot be blank.'],
            ['inventory_items', 'name_not_blank', ['name'], $blank('name'), 'Item name cannot be blank.'],
            ['users', 'first_name_not_blank', ['first_name'], $blank('first_name'), 'First name cannot be blank.'],
            ['users', 'last_name_not_blank', ['last_name'], $blank('last_name'), 'Last name cannot be blank.'],

            ['users', 'birth_date_not_too_old', ['birth_date'], "{birth_date} IS NULL OR {birth_date} >= '1900-01-01'", 'Birth date cannot be before 1900.'],
            ['events', 'start_not_too_old', ['event_start'], "{event_start} >= '2020-01-01'", 'Event start cannot be before 2020.'],

            ['sms_logs', 'to_number_format', ['to_number'], [
                "{to_number} REGEXP '^(09|639)[0-9]{9}\$'",
                "{to_number} GLOB '09{$digits}' OR {to_number} GLOB '639{$digits}'",
            ], 'SMS number must look like 09XXXXXXXXX.'],
        ];

        foreach (self::FLAGS as $table => $columns) {
            $rules[] = [$table, 'flags_0_or_1', $columns, implode(' AND ', array_map(fn ($c) => "({{$c}} IS NULL OR {{$c}} IN (0, 1))", $columns)), 'On/off values can only be 0 or 1.'];
        }
        foreach (self::ARCHIVE_TABLES as $table) {
            $rules[] = [$table, 'deleted_by_not_blank', ['deleted_by'], [
                "{deleted_by} IS NULL OR {deleted_by} NOT REGEXP '^[[:space:]]*\$'",
                "{deleted_by} IS NULL OR trim({deleted_by}, ' ' || char(9) || char(10) || char(13)) <> ''",
            ], 'Archived-by cannot be an empty text.'];
        }

        return $rules;
    }

    /** Rules that depend on today's date: [table, key, column, mysql test for a BAD value, sqlite test for a BAD value, message]. */
    private function dateRules(): array
    {
        return [
            ['users', 'birth_date_not_future', 'birth_date',
                'NEW.birth_date IS NOT NULL AND NEW.birth_date > (CURDATE() + INTERVAL 1 DAY)',
                "NEW.birth_date IS NOT NULL AND substr(NEW.birth_date, 1, 10) > date('now', '+1 day')",
                'Birth date cannot be in the future.'],
            ['events', 'start_not_too_far', 'event_start',
                'NEW.event_start > (NOW() + INTERVAL 3 YEAR)',
                "NEW.event_start > datetime('now', '+3 years')",
                'Event start cannot be more than 3 years ahead.'],
        ];
    }

    public function up(): void
    {
        $this->assertStoredRowsAreValid();

        foreach ($this->rules() as [$table, $key, $columns, $condition, $message]) {
            $this->lock($table, $key, $columns, $condition, $message);
        }
        foreach ($this->dateRules() as [$table, $key, $column, $mysqlBad, $sqliteBad, $message]) {
            $this->lockByDate($table, $key, $column, $mysqlBad, $sqliteBad, $message);
        }
    }

    public function down(): void
    {
        foreach ($this->rules() as [$table, $key]) {
            $this->unlock($table, $key);
        }
        foreach ($this->dateRules() as [$table, $key]) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$table}_{$key}_chk_insert");
            DB::unprepared("DROP TRIGGER IF EXISTS {$table}_{$key}_chk_update");
        }
    }

    // ------------------------------------------------------------------ pre-flight

    private function assertStoredRowsAreValid(): void
    {
        $problems = [];

        foreach ($this->rules() as [$table, $key, , $condition, $message]) {
            $where = 'NOT (' . $this->expr($condition, '') . ')';
            $count = DB::table($table)->whereRaw($where)->count();
            if ($count === 0) {
                continue;
            }
            $ids = DB::table($table)->whereRaw($where)->orderBy('id')->limit(5)->pluck('id')->all();
            $problems[] = "{$table} ({$key}): {$count} row(s), e.g. #" . implode(', #', $ids) . " -- {$message}";
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

    private function lockByDate(string $table, string $key, string $column, string $mysqlBad, string $sqliteBad, string $message): void
    {
        $name = "{$table}_{$key}_chk";

        if (DB::getDriverName() === 'sqlite') {
            DB::unprepared("CREATE TRIGGER {$name}_insert BEFORE INSERT ON {$table} FOR EACH ROW WHEN {$sqliteBad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            DB::unprepared("CREATE TRIGGER {$name}_update BEFORE UPDATE OF {$column} ON {$table} FOR EACH ROW WHEN NEW.{$column} IS NOT OLD.{$column} AND ({$sqliteBad}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        DB::unprepared("CREATE TRIGGER {$name}_insert BEFORE INSERT ON {$table} FOR EACH ROW BEGIN IF {$mysqlBad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
        DB::unprepared("CREATE TRIGGER {$name}_update BEFORE UPDATE ON {$table} FOR EACH ROW BEGIN IF NOT (NEW.{$column} <=> OLD.{$column}) AND ({$mysqlBad}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
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

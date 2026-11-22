<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Puts the rules that protect the barangay's records into the database itself,
 * so a bad value cannot be saved by a forgotten form rule, a script, an import
 * or a manual edit in phpMyAdmin -- not only through the screens.
 *
 *   Rating               feedback.rating is 1 to 5
 *   Money                an expense is more than 0 and at most 99,999,999.99;
 *                        an event's approved budget is 0 to 99,999,999.99
 *   Event times          the event ends after it starts; sign-in (call time)
 *                        opens before the event starts and closes no earlier
 *                        than the event ends; a time-out is not before time-in
 *   Quantities           no inventory count can be negative
 *   Allowed words        role, gender, language, barangay post, attendance
 *                        status, SMS status, stock-log action, report type
 *                        (stock-log 'disposed' and 'restored' stay allowed: they are
 *                        old history from the removed Dispose/Restore feature)
 *   Code format (regex)  user and household codes: letters, digits and dashes
 *
 * Nothing is changed or guessed. Before adding anything the migration checks
 * every stored row; if some already break a rule it stops, changes NOTHING and
 * lists those rows so they can be corrected first.
 *
 * MySQL 8.0.16+ and MariaDB 10.2.1+ get CHECK constraints. Older MySQL, which
 * silently ignores CHECK, and SQLite (used by the tests) get triggers instead.
 */
return new class extends Migration
{
    /**
     * Each rule: [table, key, columns used, valid-condition, message].
     * {col} marks a column; the condition says what a VALID row looks like.
     * The condition is a string, or [mysql/mariadb, sqlite] when a regex is needed.
     */
    private function rules(): array
    {
        $codeRegex = [
            fn (string $c) => "{{$c}} REGEXP '^[A-Za-z0-9-]+\$'",
            fn (string $c) => "{{$c}} NOT GLOB '*[^A-Za-z0-9-]*' AND {{$c}} <> ''",
        ];
        $nonNegative = fn (array $cols) => implode(' AND ', array_map(fn ($c) => "{{$c}} >= 0", $cols));
        $units = ['quantity', 'new_quantity', 'good_quantity', 'fair_quantity', 'poor_quantity'];

        return [
            // ---- feedback
            ['feedback', 'rating_range', ['rating'], '{rating} BETWEEN 1 AND 5', 'Rating must be from 1 to 5.'],
            ['feedback', 'windows_not_negative', ['close_after_hours', 'edit_window_minutes'], $nonNegative(['close_after_hours', 'edit_window_minutes']), 'Feedback time limits cannot be negative.'],

            // ---- money
            ['event_expenses', 'amount_range', ['amount'], '{amount} > 0 AND {amount} <= 99999999.99', 'Expense amount must be more than 0 and at most 99,999,999.99.'],
            ['events', 'budget_range', ['approved_budget'], '{approved_budget} IS NULL OR ({approved_budget} >= 0 AND {approved_budget} <= 99999999.99)', 'Approved budget must be from 0 to 99,999,999.99.'],

            // ---- event times
            ['events', 'end_after_start', ['event_start', 'event_end'], '{event_end} IS NULL OR {event_end} > {event_start}', 'The event must end after it starts.'],
            ['events', 'call_start_before_start', ['event_start', 'call_time_start'], '{call_time_start} IS NULL OR {call_time_start} < {event_start}', 'Call time start must be before the event starts.'],
            ['events', 'call_end_not_before_end', ['event_end', 'call_time_end'], '{call_time_end} IS NULL OR {event_end} IS NULL OR {call_time_end} >= {event_end}', 'Call time end cannot be before the event ends.'],
            ['events', 'call_window_order', ['call_time_start', 'call_time_end'], '{call_time_start} IS NULL OR {call_time_end} IS NULL OR {call_time_end} > {call_time_start}', 'Call time end must be after call time start.'],
            ['attendances', 'time_order', ['time_in', 'time_out'], '{time_in} IS NULL OR {time_out} IS NULL OR {time_out} >= {time_in}', 'Time out cannot be before time in.'],

            // ---- quantities
            ['inventory_items', 'quantities_not_negative', [...$units, 'lost_quantity'], $nonNegative([...$units, 'lost_quantity']), 'Inventory counts cannot be negative.'],
            ['event_inventory_items', 'quantities_not_negative', $units, $nonNegative($units), 'Inventory counts cannot be negative.'],
            ['event_inventory_releases', 'quantities_not_negative', $units, $nonNegative($units), 'Inventory counts cannot be negative.'],
            ['event_inventory_release_undos', 'quantity_not_negative', ['quantity'], '{quantity} >= 0', 'Inventory counts cannot be negative.'],
            ['inventory_unit_logs', 'quantity_not_negative', ['quantity'], '{quantity} >= 0', 'Inventory counts cannot be negative.'],
            ['users', 'login_attempts_not_negative', ['failed_login_attempts'], '{failed_login_attempts} >= 0', 'Failed login attempts cannot be negative.'],

            // ---- allowed words
            ['users', 'role_values', ['role'], "{role} IN ('Staff','Resident')", 'Role must be Staff or Resident.'],
            ['users', 'gender_values', ['gender'], "{gender} IS NULL OR {gender} IN ('Male','Female')", 'Gender must be Male or Female.'],
            ['users', 'language_values', ['preferred_language'], "{preferred_language} IN ('en','tl','ceb')", 'Language must be en, tl or ceb.'],
            ['users', 'position_values', ['barangay_position'], "{barangay_position} IS NULL OR {barangay_position} IN ('captain','secretary')", 'Barangay position must be captain or secretary.'],
            ['attendances', 'status_values', ['status'], "LOWER({status}) IN ('missed','incomplete','complete')", 'Attendance status is not recognised.'],
            ['sms_logs', 'status_values', ['status'], "{status} IN ('simulated','sent','failed')", 'SMS status is not recognised.'],
            ['inventory_unit_logs', 'action_values', ['action'], "{action} IN ('added','adjusted','lost','found','disposed','restored')", 'Stock log action is not recognised.'],
            ['generated_reports', 'type_values', ['type'], "{type} IN ('attendance','membership','budget','inventory')", 'Report type is not recognised.'],

            // ---- code format (regex)
            ['users', 'code_format', ['user_code'], [$codeRegex[0]('user_code'), $codeRegex[1]('user_code')], 'User code may only contain letters, digits and dashes.'],
            ['households', 'code_format', ['code'], [$codeRegex[0]('code'), $codeRegex[1]('code')], 'Household code may only contain letters, digits and dashes.'],
        ];
    }

    public function up(): void
    {
        $this->assertStoredRowsAreValid();

        foreach ($this->rules() as [$table, $key, $columns, $condition, $message]) {
            $this->lock($table, $key, $columns, $this->expr($condition, ''), $message);
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
                "Cannot lock the business rules: some stored rows already break them. Correct these rows and run the migration again; nothing was changed.\n  "
                . implode("\n  ", $problems)
            );
        }
    }

    // ------------------------------------------------------------------ building SQL

    /** The valid-condition for this database, with {col} turned into col (or NEW.col). */
    private function expr(string|array $condition, string $prefix): string
    {
        if (is_array($condition)) {
            $condition = DB::getDriverName() === 'sqlite' ? $condition[1] : $condition[0];
        }

        return preg_replace('/\{(\w+)\}/', $prefix . '$1', $condition);
    }

    private function lock(string $table, string $key, array $columns, string $expr, string $message): void
    {
        $name = "{$table}_{$key}_chk";

        // The rule list stores the raw condition; rebuild with the right column prefix for triggers.
        $rule = collect($this->rules())->first(fn ($r) => $r[0] === $table && $r[1] === $key);
        $new  = $this->expr($rule[3], 'NEW.');

        if (DB::getDriverName() === 'sqlite') {
            $of = implode(', ', $columns);
            DB::unprepared("CREATE TRIGGER {$name}_insert BEFORE INSERT ON {$table} FOR EACH ROW WHEN NOT ({$new}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            DB::unprepared("CREATE TRIGGER {$name}_update BEFORE UPDATE OF {$of} ON {$table} FOR EACH ROW WHEN NOT ({$new}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        if ($this->supportsCheck()) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expr})");
            return;
        }

        // Old MySQL parses CHECK but ignores it, so enforce the rule with triggers.
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

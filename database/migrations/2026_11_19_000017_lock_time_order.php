<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A time cannot come before the time it follows. The database refuses, for example, a record
 * that was "updated" before it was "created", or an archive, reply, undo or use that happened
 * before the record existed:
 *
 *   every table with created_at and updated_at   updated_at is not before created_at
 *   archived records                             deleted_at is not before created_at
 *   feedback and absence reasons                 staff_liked_at, staff_replied_at not before created_at;
 *                                                member_liked_reply_at not before staff_replied_at
 *   stock returns and stock logs                 undone_at is not before created_at
 *   Head Staff transfers                         expires_at is after created_at
 *   recovery codes                               used_at is not before created_at
 *
 * Judged only when a row is added, or when one of the two times changes, so records saved earlier
 * never block an unrelated edit and this migration cannot fail on stored data. A missing time
 * (NULL) is never judged. Works on MySQL, MariaDB and SQLite (the tests).
 */
return new class extends Migration
{
    /** [table, earlier column, later column, later must be strictly after?] besides the created/updated pair of every table. */
    public const PAIRS = [
        ['age_brackets',            'created_at', 'deleted_at', false],
        ['civil_statuses',          'created_at', 'deleted_at', false],
        ['current_statuses',        'created_at', 'deleted_at', false],
        ['event_expenses',          'created_at', 'deleted_at', false],
        ['feedback',                'created_at', 'deleted_at', false],
        ['households',              'created_at', 'deleted_at', false],
        ['inventory_items',         'created_at', 'deleted_at', false],
        ['feedback',                'created_at', 'staff_liked_at', false],
        ['feedback',                'created_at', 'staff_replied_at', false],
        ['feedback',                'staff_replied_at', 'member_liked_reply_at', false],
        ['absence_reasons',         'created_at', 'staff_liked_at', false],
        ['absence_reasons',         'created_at', 'staff_replied_at', false],
        ['absence_reasons',         'staff_replied_at', 'member_liked_reply_at', false],
        ['event_inventory_releases', 'created_at', 'undone_at', false],
        ['inventory_unit_logs',     'created_at', 'undone_at', false],
        ['head_staff_transfers',    'created_at', 'expires_at', true],
        ['staff_recovery_codes',    'created_at', 'used_at', false],
    ];

    /** Framework tables that have no created/updated pair worth judging. */
    private const SKIP = ['migrations', 'cache', 'cache_locks', 'sessions', 'jobs', 'job_batches', 'failed_jobs', 'password_reset_tokens', 'personal_access_tokens'];

    /** Every [table, earlier, later, strict] this database gets a rule for. */
    private function pairs(): array
    {
        $pairs = self::PAIRS;

        foreach (Schema::getTables() as $table) {
            $name = $table['name'];
            if (in_array($name, self::SKIP, true)) {
                continue;
            }
            $columns = array_column(Schema::getColumns($name), 'name');
            if (in_array('created_at', $columns, true) && in_array('updated_at', $columns, true)) {
                $pairs[] = [$name, 'created_at', 'updated_at', false];
            }
        }

        return $pairs;
    }

    private function name(string $table, string $earlier, string $later, string $event): string
    {
        // MySQL and MariaDB allow at most 64 characters in a trigger name, so the earlier column is left out
        // (each table has only one rule per later column, which keeps the names unique).
        return "{$table}_{$later}_ord_{$event}";
    }

    public function up(): void
    {
        $this->down();   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';
        $label = fn (string $c) => ucfirst(str_replace('_', ' ', $c));

        foreach ($this->pairs() as [$table, $earlier, $later, $strict]) {
            $columns = array_column(Schema::getColumns($table), 'name');
            if (!in_array($earlier, $columns, true) || !in_array($later, $columns, true)) {
                continue;   // an optional column this database does not have
            }

            // the row is wrong when both times exist and the later one is not after the earlier one
            $op = $strict ? '<=' : '<';
            $bad = "NEW.{$earlier} IS NOT NULL AND NEW.{$later} IS NOT NULL AND NEW.{$later} {$op} NEW.{$earlier}";
            $changed = $sqlite
                ? "(NEW.{$earlier} IS NOT OLD.{$earlier} OR NEW.{$later} IS NOT OLD.{$later})"
                : "(NOT (NEW.{$earlier} <=> OLD.{$earlier}) OR NOT (NEW.{$later} <=> OLD.{$later}))";
            $message = $strict
                ? "{$label($later)} must be after {$earlier}."
                : "{$label($later)} cannot be before {$earlier}.";
            $message = str_replace('_', ' ', $message);

            $this->trigger($this->name($table, $earlier, $later, 'insert'), $table, 'INSERT', null, $bad, $message, $sqlite);
            $this->trigger($this->name($table, $earlier, $later, 'update'), $table, 'UPDATE', "{$earlier}, {$later}", "{$changed} AND {$bad}", $message, $sqlite);
        }
    }

    public function down(): void
    {
        foreach ($this->pairs() as [$table, $earlier, $later]) {
            foreach (['insert', 'update'] as $event) {
                DB::unprepared('DROP TRIGGER IF EXISTS ' . $this->name($table, $earlier, $later, $event));
            }
        }
    }

    /** $bad = the condition under which the row must be refused. */
    private function trigger(string $name, string $table, string $event, ?string $updateOf, string $bad, string $message, bool $sqlite): void
    {
        if ($sqlite) {
            $on = $event === 'UPDATE' && $updateOf ? "UPDATE OF {$updateOf}" : $event;
            DB::unprepared("CREATE TRIGGER {$name} BEFORE {$on} ON {$table} FOR EACH ROW WHEN {$bad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON {$table} FOR EACH ROW BEGIN IF {$bad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
    }
};

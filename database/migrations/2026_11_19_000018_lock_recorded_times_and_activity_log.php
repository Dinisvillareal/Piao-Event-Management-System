<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Times that record WHEN SOMETHING HAPPENED cannot be rewritten afterwards, by any screen, script,
 * import or hand edit. Every such column follows one of four rules:
 *
 *   FIXED    Written once, then never changed or erased. (A blank may be filled in once.)
 *            created_at, time_in, time_out, written_at, undone_at, used_at
 *   TOGGLE   May be set, or cleared, but never changed straight from one time to another, so an
 *            archive, suspension, "like" or similar cannot be re-dated. A restore (clear) and a new
 *            archive (set again, with the real new time) stay possible.
 *            deleted_at, deactivated_at, suspended_at, two_factor_confirmed_at, staff_liked_at,
 *            member_liked_reply_at
 *   FORWARD  Can only move forward, and cannot be erased. updated_at, last_login_at
 *   ADVANCE  Can only move forward, but may be cleared (a reply removed, a password reset).
 *            staff_replied_at, password_changed_at, updated_at_notification
 *
 * Besides those, the activity log is add-only: a row of activity_logs (who, what, when, and from which
 * IP address) can never be changed and never be deleted, so the trail cannot be rewritten after the fact.
 *
 * Times that PLAN something (an event's start, end and call times, a transfer's expiry, the time an
 * account is locked until) are not here: they must stay editable.
 *
 * The rule is attached to every table that has the column, found in the database itself, so tables
 * added later are covered too. Judged only when that column changes, so a record saved earlier never
 * blocks an unrelated edit and the migration cannot fail on stored data. Works on MySQL, MariaDB and
 * SQLite (the tests).
 *
 * A trigger can be dropped by an account that holds the TRIGGER privilege, so the database user the
 * application connects with should hold neither TRIGGER nor (on activity_logs) UPDATE or DELETE.
 */
return new class extends Migration
{
    public const FIXED = 'fixed';
    public const TOGGLE = 'toggle';
    public const FORWARD = 'forward';
    public const ADVANCE = 'advance';

    /** column => rule; the same rule on every table that has the column. */
    public const MODES = [
        'created_at'            => self::FIXED,
        'time_in'               => self::FIXED,
        'time_out'              => self::FIXED,
        'written_at'            => self::FIXED,
        'undone_at'             => self::FIXED,
        'used_at'               => self::FIXED,
        'deleted_at'            => self::TOGGLE,
        'deactivated_at'        => self::TOGGLE,
        'suspended_at'          => self::TOGGLE,
        'two_factor_confirmed_at' => self::TOGGLE,
        'staff_liked_at'        => self::TOGGLE,
        'member_liked_reply_at' => self::TOGGLE,
        'updated_at'            => self::FORWARD,
        'last_login_at'         => self::FORWARD,
        'staff_replied_at'      => self::ADVANCE,
        'password_changed_at'   => self::ADVANCE,
        'updated_at_notification' => self::ADVANCE,
    ];

    public const LOG = 'activity_logs';

    /** Framework tables that are not part of the system's records. */
    private const SKIP = ['migrations', 'cache', 'cache_locks', 'sessions', 'jobs', 'job_batches', 'failed_jobs', 'password_reset_tokens', 'personal_access_tokens'];

    /** Every [table, column, rule] this database gets a lock for. */
    public function targets(): array
    {
        $targets = [];
        $seen = [];
        foreach (Schema::getTables() as $table) {
            $name = $table['name'];
            // a table listed twice (or twice under different letter case, as on Windows) gets its locks once
            if (in_array($name, self::SKIP, true) || isset($seen[strtolower($name)])) {
                continue;
            }
            $seen[strtolower($name)] = true;
            $columns = array_column(Schema::getColumns($name), 'name');
            foreach (self::MODES as $column => $mode) {
                if (in_array($column, $columns, true)) {
                    $targets[] = [$name, $column, $mode];
                }
            }
        }

        return $targets;
    }

    public function name(string $table, string $column): string
    {
        // MySQL and MariaDB allow at most 64 characters in a trigger name.
        return "{$table}_{$column}_lock";
    }

    public function names(): array
    {
        $names = array_map(fn ($t) => $this->name($t[0], $t[1]), $this->targets());
        $names[] = self::LOG . '_append_only_update';
        $names[] = self::LOG . '_append_only_delete';

        return $names;
    }

    public function up(): void
    {
        $this->down();   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';
        $changed = fn (string $c) => $sqlite ? "NEW.{$c} IS NOT OLD.{$c}" : "NOT (NEW.{$c} <=> OLD.{$c})";

        foreach ($this->targets() as [$table, $c, $mode]) {
            $label = ucfirst(str_replace('_', ' ', $c));
            $held = "OLD.{$c} IS NOT NULL AND {$changed($c)}";

            [$bad, $message] = match ($mode) {
                self::FIXED   => [$held, "{$label} cannot be changed once it is saved."],
                self::TOGGLE  => ["{$held} AND NEW.{$c} IS NOT NULL", "{$label} cannot be changed to a different time; it can only be set or cleared."],
                self::FORWARD => ["{$held} AND (NEW.{$c} IS NULL OR NEW.{$c} < OLD.{$c})", "{$label} cannot be moved back or erased."],
                self::ADVANCE => ["{$held} AND NEW.{$c} IS NOT NULL AND NEW.{$c} < OLD.{$c}", "{$label} cannot be moved back to an earlier time."],
            };

            $this->trigger($this->name($table, $c), $table, 'UPDATE', $c, $bad, $message, $sqlite);
        }

        if (in_array(self::LOG, array_column(Schema::getTables(), 'name'), true)) {
            $this->trigger(self::LOG . '_append_only_update', self::LOG, 'UPDATE', null, null, 'The activity log cannot be changed.', $sqlite);
            $this->trigger(self::LOG . '_append_only_delete', self::LOG, 'DELETE', null, null, 'The activity log cannot be deleted.', $sqlite);
        }
    }

    public function down(): void
    {
        foreach ($this->names() as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
        }
    }

    /** $bad = the condition under which the change must be refused (null = always). */
    private function trigger(string $name, string $table, string $event, ?string $updateOf, ?string $bad, string $message, bool $sqlite): void
    {
        DB::unprepared("DROP TRIGGER IF EXISTS {$name}");   // never "already exists", even after an interrupted run

        if ($sqlite) {
            $on = $event === 'UPDATE' && $updateOf ? "UPDATE OF {$updateOf}" : $event;
            $when = $bad === null ? '' : "WHEN {$bad} ";
            DB::unprepared("CREATE TRIGGER {$name} BEFORE {$on} ON {$table} FOR EACH ROW {$when}BEGIN SELECT RAISE(ABORT, '{$message}'); END");

            return;
        }

        $signal = "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}';";
        $body = $bad === null ? $signal : "IF {$bad} THEN {$signal} END IF;";
        DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON {$table} FOR EACH ROW BEGIN {$body} END");
    }
};

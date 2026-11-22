<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A time that records WHEN SOMETHING HAPPENED cannot be in the future. Created, updated,
 * archived, signed in, signed out, replied, undone, suspended, last login and similar times
 * are refused by the database if they are later than the database's own clock, so no screen,
 * script or hand edit can write a made-up future time into a record.
 *
 * Times that PLAN something (an event's start, end and call times, the time a Head Staff
 * transfer expires, the time an account is locked until) must be able to lie in the future, so
 * they are not in this list. Every date-time column in the database is in exactly one of the two
 * lists (a test checks it), so a column added later has to be classified on purpose.
 *
 * Judged only when a row is added, or when that particular column changes, so records saved
 * earlier never block an unrelated edit and this migration cannot fail on stored data. One
 * minute of grace absorbs a small clock difference between the web server and the database.
 *
 * The clock is the database's own: NOW() on MySQL/MariaDB (config/database.php pins that
 * connection to the application's time zone so both clocks agree), and on SQLite (the tests) UTC
 * shifted to the application's zone. Works on MySQL, MariaDB and SQLite.
 */
return new class extends Migration
{
    /** table => columns that record when something happened */
    public const RECORDED = [
        'absence_reasons'              => ['created_at', 'updated_at', 'staff_liked_at', 'staff_replied_at', 'member_liked_reply_at'],
        'activity_logs'                => ['created_at', 'updated_at'],
        'age_brackets'                 => ['created_at', 'updated_at', 'deleted_at'],
        'app_settings'                 => ['created_at', 'updated_at'],
        'attendances'                  => ['created_at', 'updated_at', 'time_in', 'time_out'],
        'civil_statuses'               => ['created_at', 'updated_at', 'deleted_at'],
        'content_translations'         => ['created_at', 'updated_at'],
        'current_status_user'          => ['created_at', 'updated_at'],
        'current_statuses'             => ['created_at', 'updated_at', 'deleted_at'],
        'event_expenses'               => ['created_at', 'updated_at', 'deleted_at'],
        'event_inventory_items'        => ['created_at', 'updated_at'],
        'event_inventory_release_undos' => ['created_at', 'updated_at'],
        'event_inventory_releases'     => ['created_at', 'updated_at', 'undone_at'],
        'events'                       => ['deleted_at'],
        'feedback'                     => ['created_at', 'updated_at', 'deleted_at', 'staff_liked_at', 'staff_replied_at', 'member_liked_reply_at'],
        'feedback_edits'               => ['created_at', 'updated_at', 'written_at'],
        'generated_reports'            => ['created_at', 'updated_at'],
        'head_staff_transfers'         => ['created_at', 'updated_at'],
        'households'                   => ['created_at', 'updated_at', 'deleted_at'],
        'integration_settings'         => ['created_at', 'updated_at'],
        'inventory_items'              => ['created_at', 'updated_at', 'deleted_at'],
        'inventory_unit_logs'          => ['created_at', 'updated_at', 'undone_at'],
        'membership_residents'         => ['deleted_at'],
        'memberships'                  => ['deactivated_at', 'deleted_at'],
        'name_suffixes'                => ['created_at', 'updated_at'],
        'notifications'                => ['created_at', 'updated_at', 'updated_at_notification'],
        'security_alerts'              => ['created_at', 'updated_at'],
        'sms_logs'                     => ['created_at', 'updated_at'],
        'staff_recovery_codes'         => ['created_at', 'updated_at', 'used_at'],
        'users'                        => ['deleted_at', 'suspended_at', 'last_login_at', 'password_changed_at', 'two_factor_confirmed_at'],
    ];

    /** table => columns that plan something, so the future is where they belong */
    public const PLANNED = [
        'events'               => ['event_start', 'event_end', 'call_time_start', 'call_time_end'],
        'head_staff_transfers' => ['expires_at'],
        'users'                => ['locked_until'],
    ];

    private const MESSAGE = 'A time that records when something happened cannot be in the future.';

    private function names(): array
    {
        $names = [];
        foreach (array_keys(self::RECORDED) as $table) {
            $names[] = "{$table}_not_future_chk_insert";
            $names[] = "{$table}_not_future_chk_update";
        }

        return $names;
    }

    public function up(): void
    {
        $this->down();   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';

        // the database's own "now" plus one minute of grace
        $limit = $sqlite
            ? "datetime('now', '" . sprintf('%+d', now()->getOffset()) . " seconds', '+1 minutes')"
            : '(NOW() + INTERVAL 1 MINUTE)';
        $changed = fn (string $c) => $sqlite ? "NEW.{$c} IS NOT OLD.{$c}" : "NOT (NEW.{$c} <=> OLD.{$c})";

        foreach (self::RECORDED as $table => $columns) {
            $onInsert = implode(' OR ', array_map(fn ($c) => "NEW.{$c} > {$limit}", $columns));
            $onUpdate = implode(' OR ', array_map(fn ($c) => "({$changed($c)} AND NEW.{$c} > {$limit})", $columns));

            $this->trigger("{$table}_not_future_chk_insert", $table, 'INSERT', null, $onInsert, $sqlite);
            $this->trigger("{$table}_not_future_chk_update", $table, 'UPDATE', implode(', ', $columns), $onUpdate, $sqlite);
        }
    }

    public function down(): void
    {
        foreach ($this->names() as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
        }
    }

    /** $bad = the condition under which the row must be refused. */
    private function trigger(string $name, string $table, string $event, ?string $updateOf, string $bad, bool $sqlite): void
    {
        $message = self::MESSAGE;

        if ($sqlite) {
            $on = $event === 'UPDATE' && $updateOf ? "UPDATE OF {$updateOf}" : $event;
            DB::unprepared("CREATE TRIGGER {$name} BEFORE {$on} ON {$table} FOR EACH ROW WHEN {$bad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON {$table} FOR EACH ROW BEGIN IF {$bad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
    }
};

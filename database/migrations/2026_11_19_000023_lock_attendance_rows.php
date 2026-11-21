<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The attendance rows themselves cannot be bent after the fact, whatever writes to the database:
 *
 *   Who and where   event_id and user_id never change: a row cannot be moved to another person or event.
 *   Status          the status must agree with the times: missed with no scan, Incomplete with one,
 *                   Complete with both. It is judged when a row is added or when the status or a scan
 *                   time changes, so older rows never block an unrelated edit.
 *   Delete          a row that holds a scan cannot be deleted, unless the attendance scan ledger shows the
 *                   scan was voided (the last entry for that person and event is a "void"). A row with no
 *                   scan can still be removed, as happens when an event's audience changes.
 *
 * The times themselves are already written once (2026_11_19_000018) and kept inside the sign-in and
 * sign-out windows (2026_11_19_000009). Nothing here scans stored data, so the migration cannot fail
 * on it. Works on MySQL, MariaDB and SQLite.
 */
return new class extends Migration
{
    private const NAMES = [
        'attendances_identity_lock',
        'attendances_status_follows_times_insert',
        'attendances_status_follows_times_update',
        'attendances_scanned_row_delete_lock',
    ];

    public function up(): void
    {
        $this->down();   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';
        $same = fn (string $c) => $sqlite ? "NEW.{$c} IS NOT OLD.{$c}" : "NOT (NEW.{$c} <=> OLD.{$c})";

        $derived = "CASE WHEN NEW.time_in IS NULL AND NEW.time_out IS NULL THEN 'missed' WHEN NEW.time_in IS NOT NULL AND NEW.time_out IS NOT NULL THEN 'complete' ELSE 'incomplete' END";
        // only the three known words are judged here; any other word is already refused by migration 000008
        $wrongStatus = "LOWER(COALESCE(NEW.status, '')) IN ('missed', 'incomplete', 'complete') AND LOWER(NEW.status) <> {$derived}";
        $anyChange = "({$same('status')} OR {$same('time_in')} OR {$same('time_out')})";

        $this->trigger('attendances_identity_lock', 'UPDATE', 'event_id, user_id', "{$same('event_id')} OR {$same('user_id')}",
            'An attendance row cannot be moved to another event or person.', $sqlite);
        $this->trigger('attendances_status_follows_times_insert', 'INSERT', null, $wrongStatus,
            'The attendance status must match the scans: missed with none, Incomplete with one, Complete with both.', $sqlite);
        $this->trigger('attendances_status_follows_times_update', 'UPDATE', 'status, time_in, time_out', "{$anyChange} AND {$wrongStatus}",
            'The attendance status must match the scans: missed with none, Incomplete with one, Complete with both.', $sqlite);

        $voided = "(SELECT s.kind FROM attendance_scans s WHERE s.event_id = OLD.event_id AND s.user_id = OLD.user_id ORDER BY s.id DESC LIMIT 1) = 'void'";
        $this->trigger('attendances_scanned_row_delete_lock', 'DELETE', null,
            "(OLD.time_in IS NOT NULL OR OLD.time_out IS NOT NULL) AND NOT COALESCE({$voided}, 0)",
            'An attendance row that holds a scan cannot be deleted. Void the scan first.', $sqlite);
    }

    public function down(): void
    {
        foreach (self::NAMES as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
        }
    }

    /** $bad = the condition under which the change must be refused. */
    private function trigger(string $name, string $event, ?string $updateOf, string $bad, string $message, bool $sqlite): void
    {
        if ($sqlite) {
            $on = $event === 'UPDATE' && $updateOf ? "UPDATE OF {$updateOf}" : $event;
            DB::unprepared("CREATE TRIGGER {$name} BEFORE {$on} ON attendances FOR EACH ROW WHEN {$bad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");

            return;
        }

        DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON attendances FOR EACH ROW BEGIN IF {$bad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
    }
};

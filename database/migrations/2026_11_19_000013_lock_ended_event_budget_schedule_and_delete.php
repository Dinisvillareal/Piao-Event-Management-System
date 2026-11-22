<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Once an event has ended, its money and its schedule are history. The database itself
 * refuses to change them (triggers, because the rule looks at the clock and at a second table):
 *
 *   Expenses   An ended event's expenses cannot be added, edited, archived, restored or
 *              permanently deleted, nor moved to or from an ended event.
 *   Budget     An ended event's approved budget cannot be changed.
 *   Schedule   An ended event's start, end and call times cannot be changed (recorded
 *              sign-ins and sign-outs are judged against them).
 *   Delete     An ended event cannot be permanently deleted (the cascade would erase its
 *              attendance, expenses and loan history). Archiving stays allowed: it is
 *              reversible and keeps every record. Name, description, location and the
 *              other text fields stay editable.
 *
 * "Ended" is the same rule as Event::hasEnded(): the end time, else the call-time end, else
 * the end of the start day, is already past. Every rule judges a row only when it is added,
 * changed or deleted, so records saved earlier never block an unrelated edit and this
 * migration cannot fail on stored data (no pre-flight scan is needed).
 *
 * The clock is the database's own: NOW() on MySQL/MariaDB, and on SQLite (the tests) UTC
 * shifted to the application's time zone. Works on MySQL, MariaDB and SQLite.
 *
 * Seeding historic data: the seeders that record expenses for past events call down()
 * first and up() afterwards, because history has to be written before it can be locked.
 */
return new class extends Migration
{
    private const NAMES = [
        'event_expenses_ended_chk_insert',
        'event_expenses_ended_chk_update',
        'event_expenses_ended_chk_delete',
        'events_ended_budget_chk_update',
        'events_ended_schedule_chk_update',
        'events_ended_chk_delete',
    ];

    public function up(): void
    {
        $this->down();   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';

        // "now" in the database's own clock; SQLite has only UTC, so shift it to the app's zone.
        $now = $sqlite ? "datetime('now', '" . sprintf('%+d', now()->getOffset()) . " seconds')" : 'NOW()';
        $endOf = fn (string $r) => $sqlite
            ? "COALESCE({$r}.event_end, {$r}.call_time_end, date({$r}.event_start) || ' 23:59:59')"
            : "COALESCE({$r}.event_end, {$r}.call_time_end, TIMESTAMP(DATE({$r}.event_start), '23:59:59'))";

        // the event this row belongs to has ended (NULL, i.e. no such event, counts as "not ended")
        $parentEnded = fn (string $ref) => "(SELECT {$endOf('e')} < {$now} FROM events e WHERE e.id = {$ref})";
        $ended = fn (string $r) => "{$endOf($r)} < {$now}";   // an events row itself
        $changed = fn (string $c) => $sqlite ? "NEW.{$c} IS NOT OLD.{$c}" : "NOT (NEW.{$c} <=> OLD.{$c})";

        $money = 'The expenses and budget of an event that has ended cannot be changed.';

        $this->trigger('event_expenses_ended_chk_insert', 'event_expenses', 'INSERT', null,
            $parentEnded('NEW.event_id'), $money, $sqlite);
        $this->trigger('event_expenses_ended_chk_update', 'event_expenses', 'UPDATE', null,
            '(' . $parentEnded('OLD.event_id') . ' OR ' . $parentEnded('NEW.event_id') . ')', $money, $sqlite);
        $this->trigger('event_expenses_ended_chk_delete', 'event_expenses', 'DELETE', null,
            $parentEnded('OLD.event_id'), $money, $sqlite);

        $this->trigger('events_ended_budget_chk_update', 'events', 'UPDATE', 'approved_budget',
            $ended('OLD') . ' AND ' . $changed('approved_budget'), $money, $sqlite);

        $this->trigger('events_ended_schedule_chk_update', 'events', 'UPDATE', 'event_start, event_end, call_time_start, call_time_end',
            $ended('OLD') . ' AND (' . implode(' OR ', array_map($changed, ['event_start', 'event_end', 'call_time_start', 'call_time_end'])) . ')',
            'The schedule of an event that has ended cannot be changed.', $sqlite);

        $this->trigger('events_ended_chk_delete', 'events', 'DELETE', null,
            $ended('OLD'), 'An event that has ended cannot be permanently deleted.', $sqlite);
    }

    public function down(): void
    {
        foreach (self::NAMES as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
        }
    }

    /** $bad = the condition under which the change must be refused. */
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

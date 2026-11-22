<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Three more rules, enforced by the database itself as triggers (a CHECK cannot look at a
 * second table, and the third one depends on a change of state):
 *
 *   Returns       A return (event_inventory_releases) cannot give back more units than the event
 *                 still has out on loan (event_inventory_items). The app records the return
 *                 BEFORE it lowers the loan, so the database compares the return with the loan
 *                 as it stood.
 *
 *   Lost units    Units reported lost from an event's loan (inventory_unit_logs, action 'lost',
 *                 with an event) cannot be more than that event still has out on loan, judged
 *                 the same way.
 *
 *   Archived by   A record cannot be archived (deleted_at set) without saying who archived it
 *                 (deleted_by filled in). Judged when a row is added already archived or when
 *                 deleted_at changes, so restoring a record, or an old archived row saved before
 *                 deleted_by existed, never blocks anything.
 *
 * Every rule judges a row only when it is added (or, for archiving, when deleted_at changes),
 * so records saved earlier never block an unrelated edit and this migration cannot fail on
 * stored data. Works on MySQL, MariaDB and SQLite (the tests).
 */
return new class extends Migration
{
    private const ARCHIVE_TABLES = [
        'events', 'event_expenses', 'age_brackets', 'civil_statuses', 'households',
        'current_statuses', 'users', 'inventory_items', 'feedback', 'memberships',
    ];

    private const LOAN_OUT = '(SELECT COALESCE(SUM(l.quantity), 0) FROM event_inventory_items l WHERE l.event_id = NEW.event_id AND l.inventory_item_id = NEW.inventory_item_id)';

    private function names(): array
    {
        $names = [
            'event_inventory_releases_return_chk_insert',
            'inventory_unit_logs_lost_chk_insert',
        ];
        foreach (self::ARCHIVE_TABLES as $table) {
            $names[] = "{$table}_archived_by_chk_insert";
            $names[] = "{$table}_archived_by_chk_update";
        }

        return $names;
    }

    public function up(): void
    {
        $this->down();   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';

        $this->trigger('event_inventory_releases_return_chk_insert', 'event_inventory_releases', 'INSERT', null,
            'NEW.quantity > ' . self::LOAN_OUT,
            'Cannot return more than the event still has on loan.', $sqlite);

        $this->trigger('inventory_unit_logs_lost_chk_insert', 'inventory_unit_logs', 'INSERT', null,
            "NEW.action = 'lost' AND NEW.event_id IS NOT NULL AND NEW.quantity > " . self::LOAN_OUT,
            'Cannot report more units lost than the event still has on loan.', $sqlite);

        $blank = $sqlite
            ? "trim(NEW.deleted_by, ' ' || char(9) || char(10) || char(13)) = ''"
            : "NEW.deleted_by REGEXP '^[[:space:]]*\$'";
        $noArchiver = "NEW.deleted_at IS NOT NULL AND (NEW.deleted_by IS NULL OR {$blank})";
        $changed = $sqlite ? 'NEW.deleted_at IS NOT OLD.deleted_at' : 'NOT (NEW.deleted_at <=> OLD.deleted_at)';
        $message = 'An archived record must say who archived it.';

        foreach (self::ARCHIVE_TABLES as $table) {
            $this->trigger("{$table}_archived_by_chk_insert", $table, 'INSERT', null, $noArchiver, $message, $sqlite);
            $this->trigger("{$table}_archived_by_chk_update", $table, 'UPDATE', 'deleted_at', "{$changed} AND ({$noArchiver})", $message, $sqlite);
        }
    }

    public function down(): void
    {
        foreach ($this->names() as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
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

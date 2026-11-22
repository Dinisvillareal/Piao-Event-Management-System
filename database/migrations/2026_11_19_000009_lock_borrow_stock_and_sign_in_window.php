<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Two rules that compare one table with another, enforced by the database itself
 * (they can only be triggers, because a CHECK may not look at a second table):
 *
 *   Borrowing  A loan row (event_inventory_items) cannot take more units than the
 *              item has in stock -- in total and in each condition (new, good,
 *              fair, poor). This is judged when a loan is added and when it grows,
 *              BEFORE the units leave stock. Lowering or deleting a loan is always
 *              allowed.
 *
 *   Sign-in    attendances.time_in must fall inside the event's sign-in window,
 *              from call_time_start (if set) up to event_start; attendances.time_out
 *              must fall inside the sign-out window, from event_end up to
 *              call_time_end (no upper limit when there is none, and no limit at all
 *              for an event without an end). The same windows the scan screen applies.
 *
 * A row is judged only when it is added or when that time / quantity is changed, so
 * records saved earlier never block an unrelated edit, and the migration cannot fail
 * on existing data.
 *
 * Works on MySQL, MariaDB and SQLite (the tests); nothing needs a newer server version.
 */
return new class extends Migration
{
    private const UNIT_COLUMNS = ['quantity', 'new_quantity', 'good_quantity', 'fair_quantity', 'poor_quantity'];

    private const TRIGGERS = [
        'event_inventory_items_stock_chk_insert' => 'event_inventory_items',
        'event_inventory_items_stock_chk_update' => 'event_inventory_items',
        'attendances_time_in_window_chk_insert'  => 'attendances',
        'attendances_time_in_window_chk_update'  => 'attendances',
        'attendances_time_out_window_chk_insert' => 'attendances',
        'attendances_time_out_window_chk_update' => 'attendances',
    ];

    public function up(): void
    {
        $this->down();   // safe to run twice

        $sqlite = DB::getDriverName() === 'sqlite';

        // ---- borrowing: new units wanted > units in stock
        $tooMuchNew = implode(' OR ', array_map(fn ($c) => "NEW.{$c} > i.{$c}", self::UNIT_COLUMNS));
        $tooMuchMore = implode(' OR ', array_map(fn ($c) => "(NEW.{$c} - OLD.{$c}) > i.{$c}", self::UNIT_COLUMNS));
        $insertBad = "EXISTS (SELECT 1 FROM inventory_items i WHERE i.id = NEW.inventory_item_id AND ({$tooMuchNew}))";
        $updateBad = "EXISTS (SELECT 1 FROM inventory_items i WHERE i.id = NEW.inventory_item_id AND ({$tooMuchMore}))";
        $of = implode(', ', self::UNIT_COLUMNS);
        $msg = 'Cannot borrow more than the item has in stock.';

        $this->trigger('event_inventory_items_stock_chk_insert', 'event_inventory_items', 'INSERT', null, $insertBad, $msg, $sqlite);
        $this->trigger('event_inventory_items_stock_chk_update', 'event_inventory_items', 'UPDATE', $of, $updateBad, $msg, $sqlite);

        // ---- sign-in: outside [call_time_start, event_start]
        $inBad = "NEW.time_in IS NOT NULL AND EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id"
            . " AND ((e.call_time_start IS NOT NULL AND NEW.time_in < e.call_time_start) OR NEW.time_in > e.event_start))";
        $inChanged = $sqlite ? 'NEW.time_in IS NOT OLD.time_in' : 'NOT (NEW.time_in <=> OLD.time_in)';
        $msgIn = 'Sign-in is outside the sign-in window of the event.';
        $this->trigger('attendances_time_in_window_chk_insert', 'attendances', 'INSERT', null, $inBad, $msgIn, $sqlite);
        $this->trigger('attendances_time_in_window_chk_update', 'attendances', 'UPDATE', 'time_in', "{$inChanged} AND {$inBad}", $msgIn, $sqlite);

        // ---- sign-out: outside [event_end, call_time_end]
        $outBad = "NEW.time_out IS NOT NULL AND EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND e.event_end IS NOT NULL"
            . " AND (NEW.time_out < e.event_end OR (e.call_time_end IS NOT NULL AND NEW.time_out > e.call_time_end)))";
        $outChanged = $sqlite ? 'NEW.time_out IS NOT OLD.time_out' : 'NOT (NEW.time_out <=> OLD.time_out)';
        $msgOut = 'Sign-out is outside the sign-out window of the event.';
        $this->trigger('attendances_time_out_window_chk_insert', 'attendances', 'INSERT', null, $outBad, $msgOut, $sqlite);
        $this->trigger('attendances_time_out_window_chk_update', 'attendances', 'UPDATE', 'time_out', "{$outChanged} AND {$outBad}", $msgOut, $sqlite);
    }

    public function down(): void
    {
        foreach (array_keys(self::TRIGGERS) as $name) {
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

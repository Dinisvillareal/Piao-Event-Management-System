<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * An inventory item that is out on loan cannot be taken out of the inventory, enforced by the
 * database itself (a trigger, because the rule looks at a second table):
 *
 *   Archive       (soft delete: deleted_at is set)   refused while any event still has the item on loan.
 *   Permanent     (the row is deleted)               refused while the item is on loan or has a
 *                 delete                             return history, because the links from loans and
 *                 returns to the item are ON DELETE CASCADE and would silently erase that history.
 *
 * The archive rule is judged only when deleted_at changes, so restoring an item, or an old item
 * archived before this rule, never blocks an unrelated edit, and the migration cannot fail on
 * stored data. A trigger is used instead of changing the foreign keys to RESTRICT because that
 * would rebuild the tables on SQLite (used by the tests) and drop the triggers already on them.
 *
 * Works on MySQL, MariaDB and SQLite.
 */
return new class extends Migration
{
    private const NAMES = ['inventory_items_on_loan_chk_update', 'inventory_items_on_loan_chk_delete'];

    public function up(): void
    {
        $this->down();   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';

        $onLoan = '(SELECT COUNT(*) FROM event_inventory_items l WHERE l.inventory_item_id = ID) > 0';
        $hasHistory = '(SELECT COUNT(*) FROM event_inventory_releases r WHERE r.inventory_item_id = ID) > 0';

        $archiveBad = 'NEW.deleted_at IS NOT NULL AND ' . str_replace('ID', 'NEW.id', $onLoan);
        $archiveChanged = $sqlite ? 'NEW.deleted_at IS NOT OLD.deleted_at' : 'NOT (NEW.deleted_at <=> OLD.deleted_at)';
        $deleteBad = '(' . str_replace('ID', 'OLD.id', $onLoan) . ' OR ' . str_replace('ID', 'OLD.id', $hasHistory) . ')';

        $this->trigger('inventory_items_on_loan_chk_update', 'UPDATE', 'deleted_at', "{$archiveChanged} AND ({$archiveBad})",
            'An item that is on loan cannot be archived.', $sqlite);
        $this->trigger('inventory_items_on_loan_chk_delete', 'DELETE', null, $deleteBad,
            'An item that is on loan or has a return history cannot be deleted.', $sqlite);
    }

    public function down(): void
    {
        foreach (self::NAMES as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
        }
    }

    /** $bad = the condition under which the row must be refused. */
    private function trigger(string $name, string $event, ?string $updateOf, string $bad, string $message, bool $sqlite): void
    {
        if ($sqlite) {
            $on = $event === 'UPDATE' && $updateOf ? "UPDATE OF {$updateOf}" : $event;
            DB::unprepared("CREATE TRIGGER {$name} BEFORE {$on} ON inventory_items FOR EACH ROW WHEN {$bad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON inventory_items FOR EACH ROW BEGIN IF {$bad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
    }
};

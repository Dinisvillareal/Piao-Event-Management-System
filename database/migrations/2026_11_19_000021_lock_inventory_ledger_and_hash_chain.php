<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The inventory unit log is the item's LEDGER: every added, adjusted, lost and found entry. Like a
 * bookkeeping ledger, an entry is never rewritten; a mistake is fixed by undoing the entry and adding a
 * new one (which is what the app already does). The database enforces exactly that:
 *
 *   core columns are written once   item, event, action, quantity, units, reason, photos, who recorded it
 *                                   (and the time, see migration 2026_11_19_000018) never change.
 *   only the undo marker may change undone_at and undone_by are set together, once, and only on a
 *                                   'found' entry. Neither can be changed or cleared afterwards.
 *   no entry can be deleted
 *   hash chain                      every new entry stores a fingerprint of its content (the undo marker
 *                                   excluded, as it may legitimately change) and of the entry before it
 *                                   (App\Support\AuditChain), so an edit, a removal or a planted entry
 *                                   is named by `php artisan log:verify` even if the triggers are bypassed.
 *
 * Entries saved before this migration have no fingerprint and are left alone. Nothing here scans stored
 * data, so the migration cannot fail on it. Works on MySQL, MariaDB and SQLite (the tests).
 */
return new class extends Migration
{
    public const TABLE = 'inventory_unit_logs';

    /** The columns of an entry that are written once (the ones this database has). */
    private const CORE = ['inventory_item_id', 'event_id', 'action', 'quantity', 'units', 'reason', 'photo_path', 'extra_photo_paths', 'user_code', 'prev_hash', 'row_hash'];

    private const NAMES = [
        'inventory_unit_logs_ledger_core_update',
        'inventory_unit_logs_undoer_fixed_update',
        'inventory_unit_logs_undo_pair_update',
        'inventory_unit_logs_undo_found_update',
        'inventory_unit_logs_ledger_delete',
    ];

    public function up(): void
    {
        if (!Schema::hasColumn(self::TABLE, 'row_hash')) {
            Schema::table(self::TABLE, function (Blueprint $table) {
                $table->string('prev_hash', 64)->nullable();
                $table->string('row_hash', 64)->nullable();
            });
        }

        $this->down(false);   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';
        $changed = fn (string $c) => $sqlite ? "NEW.{$c} IS NOT OLD.{$c}" : "NOT (NEW.{$c} <=> OLD.{$c})";

        $columns = array_column(Schema::getColumns(self::TABLE), 'name');
        $core = array_values(array_intersect(self::CORE, $columns));   // an optional column a database no longer has is skipped
        $this->trigger(self::NAMES[0], 'UPDATE', implode(', ', $core), implode(' OR ', array_map(fn ($c) => $changed($c), $core)),
            'A ledger entry cannot be changed. Undo it and add a new entry instead.', $sqlite);

        $this->trigger(self::NAMES[1], 'UPDATE', 'undone_by', "OLD.undone_by IS NOT NULL AND {$changed('undone_by')}",
            'Who undid an entry cannot be changed.', $sqlite);

        $this->trigger(self::NAMES[2], 'UPDATE', 'undone_at, undone_by',
            "({$changed('undone_at')} OR {$changed('undone_by')}) AND ((NEW.undone_at IS NULL) <> (NEW.undone_by IS NULL))",
            'An undo needs both the time and who undid it.', $sqlite);

        $this->trigger(self::NAMES[3], 'UPDATE', 'undone_at, action', "{$changed('undone_at')} AND NEW.undone_at IS NOT NULL AND NEW.action <> 'found'",
            'Only a found report can be undone.', $sqlite);

        $this->trigger(self::NAMES[4], 'DELETE', null, null, 'A ledger entry cannot be deleted.', $sqlite);
    }

    public function down(bool $dropColumns = true): void
    {
        foreach (self::NAMES as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
        }

        if ($dropColumns && Schema::hasColumn(self::TABLE, 'row_hash')) {
            Schema::table(self::TABLE, function (Blueprint $table) {
                $table->dropColumn(['prev_hash', 'row_hash']);
            });
        }
    }

    /** $bad = the condition under which the change must be refused (null = always). */
    private function trigger(string $name, string $event, ?string $updateOf, ?string $bad, string $message, bool $sqlite): void
    {
        $table = self::TABLE;

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

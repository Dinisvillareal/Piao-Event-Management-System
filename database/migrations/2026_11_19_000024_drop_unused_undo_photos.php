<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Removes the two photo columns of the "undo a return" action. Moving a return back to Pending never takes a
 * photo (the return already carries its own evidence), so event_inventory_release_undos.photo_path and
 * event_inventory_releases.undo_photo_path were never filled and nothing read them.
 *
 * The file-type and file-path locks on these two columns (migrations 000004 and 000005) are removed first,
 * because a database trigger that names a column that no longer exists would fail on every later save.
 * Those two migrations already skip a column that is not there, so they keep working when run again.
 * Photos saved earlier (there are none in the demonstration data) stay on disk; only the empty column goes.
 */
return new class extends Migration
{
    private const COLUMNS = [
        ['event_inventory_release_undos', 'photo_path'],
        ['event_inventory_releases', 'undo_photo_path'],
    ];

    public function up(): void
    {
        foreach (self::COLUMNS as [$table, $column]) {
            if (!Schema::hasColumn($table, $column)) {
                continue;
            }
            foreach (['i', 'u'] as $suffix) {
                DB::unprepared("DROP TRIGGER IF EXISTS lock_{$table}_{$column}_{$suffix}");
            }
            Schema::table($table, fn (Blueprint $t) => $t->dropColumn($column));
        }
    }

    /** Puts the empty columns back. Run migrations 000004 and 000005 again to lock them as before. */
    public function down(): void
    {
        foreach (self::COLUMNS as [$table, $column]) {
            if (!Schema::hasColumn($table, $column)) {
                Schema::table($table, fn (Blueprint $t) => $t->string($column)->nullable());
            }
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Report History (generated_reports: who produced which report, when, with which filters and
 * figures) is evidence, so it is protected like the activity log:
 *
 *   add-only      A row can be added and read, never edited and never deleted, whatever writes to the
 *                 database. (If a report was wrong, a new one is generated; the old one stays as the
 *                 record of what was handed out at the time.)
 *   hash chain    Every new row stores a fingerprint of its content and of the row before it (see
 *                 App\Support\AuditChain), so a row that is edited, removed or planted by hand is
 *                 named by `php artisan log:verify` even if someone gets past the add-only lock.
 *
 * Rows saved before this migration have no fingerprint and are left alone. Nothing here scans stored
 * data, so the migration cannot fail on it. Works on MySQL, MariaDB and SQLite (the tests).
 */
return new class extends Migration
{
    public const TABLE = 'generated_reports';

    private const NAMES = ['generated_reports_append_only_update', 'generated_reports_append_only_delete'];

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
        $this->trigger(self::NAMES[0], 'UPDATE', 'The report history cannot be changed.', $sqlite);
        $this->trigger(self::NAMES[1], 'DELETE', 'The report history cannot be deleted.', $sqlite);
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

    private function trigger(string $name, string $event, string $message, bool $sqlite): void
    {
        $table = self::TABLE;

        if ($sqlite) {
            DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON {$table} FOR EACH ROW BEGIN SELECT RAISE(ABORT, '{$message}'); END");

            return;
        }

        DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON {$table} FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END");
    }
};

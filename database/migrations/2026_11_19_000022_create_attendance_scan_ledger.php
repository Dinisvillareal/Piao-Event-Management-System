<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The attendance scan ledger: every real sign-in and sign-out is written ONCE to attendance_scans, and
 * `attendances` is the summary of it. The ledger is protected like the other histories:
 *
 *   add-only      A row can be added and read, never edited and never deleted, whatever writes to the
 *                 database. A mistake is not edited away: an entry is voided by adding a "void" entry.
 *   hash chain    Every new row stores a fingerprint of its content and of the row before it (see
 *                 App\Support\AuditChain), so a row edited, removed or planted by hand is named by
 *                 `php artisan log:verify`, and `php artisan attendance:reconcile` names every attendance
 *                 row whose times or status do not agree with the ledger.
 *   clean values  kind is in, out or void; source is scan, offline or system; a sign-in or sign-out
 *                 carries its time, a void carries none; a time cannot be in the future.
 *
 * The table has no foreign keys on purpose: like the other histories it must outlive the rows it describes.
 * Nothing here scans stored data, so the migration cannot fail on it. Works on MySQL, MariaDB and SQLite.
 */
return new class extends Migration
{
    public const TABLE = 'attendance_scans';

    /** The recorded-time columns of this table (it is added after the no-future lock, so it lists itself). */
    public const RECORDED = ['created_at', 'scanned_at'];

    public const KINDS = ['in', 'out', 'void'];
    public const SOURCES = ['scan', 'offline', 'system'];

    private function names(): array
    {
        return [
            'attendance_scans_values_chk_insert',
            'attendance_scans_not_future_chk_insert',
            'attendance_scans_created_at_lock',
            'attendance_scans_append_only_update',
            'attendance_scans_append_only_delete',
        ];
    }

    public function up(): void
    {
        if (!Schema::hasTable(self::TABLE)) {
            Schema::create(self::TABLE, function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('event_id');
                $table->unsignedBigInteger('user_id');
                $table->string('kind', 8);
                $table->dateTime('scanned_at')->nullable();
                $table->string('source', 10);
                $table->string('recorded_by', 40)->nullable();
                $table->string('note', 150)->nullable();
                $table->timestamp('created_at')->nullable();
                $table->string('prev_hash', 64)->nullable();
                $table->string('row_hash', 64)->nullable();
                $table->index(['event_id', 'user_id', 'id'], 'attendance_scans_pair_idx');
            });
        }

        $this->down(false);   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';
        $kinds = "'" . implode("','", self::KINDS) . "'";
        $sources = "'" . implode("','", self::SOURCES) . "'";
        $limit = $sqlite
            ? "datetime('now', '" . sprintf('%+d', now()->getOffset()) . " seconds', '+1 minutes')"
            : '(NOW() + INTERVAL 1 MINUTE)';
        $changed = $sqlite ? 'NEW.created_at IS NOT OLD.created_at' : 'NOT (NEW.created_at <=> OLD.created_at)';

        $this->trigger('attendance_scans_values_chk_insert', 'INSERT', null,
            "NEW.kind NOT IN ({$kinds}) OR NEW.source NOT IN ({$sources}) OR (NEW.kind = 'void' AND NEW.scanned_at IS NOT NULL) OR (NEW.kind <> 'void' AND NEW.scanned_at IS NULL)",
            'A scan needs a kind (in, out or void), a source, and its time (a void has none).', $sqlite);
        $this->trigger('attendance_scans_not_future_chk_insert', 'INSERT', null,
            "NEW.created_at > {$limit} OR NEW.scanned_at > {$limit}",
            'A time that records when something happened cannot be in the future.', $sqlite);
        $this->trigger('attendance_scans_created_at_lock', 'UPDATE', 'created_at', "OLD.created_at IS NOT NULL AND {$changed}", 'Created at cannot be changed once it is saved.', $sqlite);
        $this->trigger('attendance_scans_append_only_update', 'UPDATE', null, null, 'The attendance scan ledger cannot be changed.', $sqlite);
        $this->trigger('attendance_scans_append_only_delete', 'DELETE', null, null, 'The attendance scan ledger cannot be deleted.', $sqlite);
    }

    public function down(bool $dropTable = true): void
    {
        foreach ($this->names() as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
        }

        if ($dropTable) {
            Schema::dropIfExists(self::TABLE);
        }
    }

    /** $bad = the condition under which the row must be refused (null = always). */
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

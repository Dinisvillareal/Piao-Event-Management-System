<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 1) Found units belong to the ITEM, never to an event.
 *    An event's lost count is whatever was recorded when its loan was
 *    returned and it never changes afterwards; units found later are logged
 *    against the item only (inventory_unit_logs.event_id stays NULL).
 *    Older "found" rows that were credited to an event are detached, and a
 *    CHECK constraint keeps it that way (MySQL / MariaDB only -- SQLite, used
 *    by the automated tests, cannot add a CHECK to an existing table).
 *
 * 2) `cache_locks` is dropped. Nothing in the application takes a cache lock
 *    (no Cache::lock, withoutOverlapping, onOneServer or unique jobs), so the
 *    table only ever sat empty. The `cache` table itself is still needed.
 */
return new class extends Migration
{
    private const CHECK = 'inventory_unit_logs_found_no_event_chk';

    private function isMysql(): bool
    {
        return in_array(DB::getDriverName(), ['mysql', 'mariadb'], true);
    }

    public function up(): void
    {
        DB::table('inventory_unit_logs')
            ->where('action', 'found')
            ->whereNotNull('event_id')
            ->update(['event_id' => null]);

        if ($this->isMysql()) {
            DB::statement("ALTER TABLE `inventory_unit_logs` ADD CONSTRAINT `" . self::CHECK . "` CHECK (`action` <> 'found' OR `event_id` IS NULL)");
        }

        Schema::dropIfExists('cache_locks');
    }

    public function down(): void
    {
        if (! Schema::hasTable('cache_locks')) {
            Schema::create('cache_locks', function (Blueprint $table) {
                $table->string('key')->primary();
                $table->string('owner');
                $table->integer('expiration');
            });
        }

        if ($this->isMysql()) {
            try {
                DB::statement('ALTER TABLE `inventory_unit_logs` DROP CONSTRAINT `' . self::CHECK . '`');
            } catch (\Throwable $e) {
                DB::statement('ALTER TABLE `inventory_unit_logs` DROP CHECK `' . self::CHECK . '`'); // older MySQL syntax
            }
        }
        // Detached event links on old "found" rows cannot be restored.
    }
};

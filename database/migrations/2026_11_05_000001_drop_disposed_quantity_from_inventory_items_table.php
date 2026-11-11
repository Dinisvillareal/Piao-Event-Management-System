<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Inventory only tracks the equipment that events borrow, so writing units off
 * as "disposed" (and restoring them) is not part of the system. The Dispose
 * and Restore actions are gone, and so is the counter they kept.
 *
 * Units that were already disposed were never part of the in-stock `quantity`,
 * so removing the counter changes no stock figure. Old disposed / restored
 * rows in inventory_unit_logs are left untouched (they are simply no longer shown).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('inventory_items', 'disposed_quantity')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                $table->dropColumn('disposed_quantity');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('inventory_items', 'disposed_quantity')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                $table->unsignedInteger('disposed_quantity')->default(0)->after('lost_pending');
            });
        }
    }
};

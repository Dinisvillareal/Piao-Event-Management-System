<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lost units are no longer logged on a release (they are reported
     * separately from the loan and live on the inventory item), so the
     * columns added by the previous migration are removed again.
     */
    public function up(): void
    {
        // Loss-only entries (nothing returned) were stored as empty releases.
        // They are not returns, so they are removed; the item's lost count stays.
        if (Schema::hasColumn('event_inventory_releases', 'lost_quantity')) {
            DB::table('event_inventory_releases')->where('quantity', 0)->where('lost_quantity', '>', 0)->delete();
        }

        foreach (['lost_quantity', 'lost_from_pending', 'lost_units'] as $column) {
            if (Schema::hasColumn('event_inventory_releases', $column)) {
                Schema::table('event_inventory_releases', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }
    }

    public function down(): void
    {
        // Nothing to restore: the columns are no longer used.
    }
};

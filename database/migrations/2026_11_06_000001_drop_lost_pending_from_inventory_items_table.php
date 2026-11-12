<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Units are now reported lost only after the equipment is back, through
 * Returns -> Report Lost, so nothing adds to `lost_pending` any more (it was
 * the part of `lost_quantity` reported while the units were still out on a
 * loan). It was 0 on every row. `lost_quantity` already included those units,
 * so removing the column changes no count.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('inventory_items', 'lost_pending')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                $table->dropColumn('lost_pending');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('inventory_items', 'lost_pending')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                $table->unsignedInteger('lost_pending')->default(0)->after('lost_quantity');
            });
        }
    }
};

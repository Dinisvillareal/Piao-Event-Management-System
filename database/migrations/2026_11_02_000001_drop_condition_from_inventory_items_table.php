<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An item's units are stored per condition (new_/good_/fair_/poor_quantity),
     * so a separate single "condition" column only repeated one of them and could
     * disagree with the counts. The item's main condition is now worked out from
     * the counts (InventoryItem::getConditionAttribute); nothing needs the column.
     */
    public function up(): void
    {
        if (Schema::hasColumn('inventory_items', 'condition')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                $table->dropColumn('condition');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('inventory_items', 'condition')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                $table->enum('condition', ['New', 'Good', 'Fair', 'Poor'])->default('Good')->after('quantity');
            });

            // Largest group wins; ties go to the worse condition (same rule as the model).
            DB::statement("UPDATE inventory_items SET `condition` = CASE
                WHEN poor_quantity >= GREATEST(new_quantity, good_quantity, fair_quantity, poor_quantity) AND poor_quantity > 0 THEN 'Poor'
                WHEN fair_quantity >= GREATEST(new_quantity, good_quantity, fair_quantity) AND fair_quantity > 0 THEN 'Fair'
                WHEN good_quantity >= new_quantity AND good_quantity > 0 THEN 'Good'
                WHEN new_quantity > 0 THEN 'New'
                ELSE 'Good' END");
        }
    }
};

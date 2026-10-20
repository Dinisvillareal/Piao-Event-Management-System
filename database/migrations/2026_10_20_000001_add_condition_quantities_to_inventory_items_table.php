<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One item can hold units in different conditions (e.g. Monobloc Chairs:
     * 45 Good + 15 New) instead of needing a duplicate row per condition.
     *
     * new/good/fair/poor_quantity count the IN-STOCK units by condition, so
     * they always add up to `quantity`. The old single `condition` column
     * stays as the item's main (largest) condition for filters and reports.
     *
     * Existing rows keep working: all of their stock moves into the column
     * matching their current condition.
     */
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->unsignedInteger('new_quantity')->default(0)->after('quantity');
            $table->unsignedInteger('good_quantity')->default(0)->after('new_quantity');
            $table->unsignedInteger('fair_quantity')->default(0)->after('good_quantity');
            $table->unsignedInteger('poor_quantity')->default(0)->after('fair_quantity');
        });

        foreach (['New' => 'new_quantity', 'Good' => 'good_quantity', 'Fair' => 'fair_quantity', 'Poor' => 'poor_quantity'] as $condition => $column) {
            DB::table('inventory_items')->where('condition', $condition)->update([$column => DB::raw('quantity')]);
        }
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn(['new_quantity', 'good_quantity', 'fair_quantity', 'poor_quantity']);
        });
    }
};

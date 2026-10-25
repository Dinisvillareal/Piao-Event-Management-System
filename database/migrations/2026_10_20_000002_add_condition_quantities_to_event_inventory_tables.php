<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Staff pick WHICH units an event borrows (e.g. 10 Good + 5 New), so each
     * borrow row -- and each release of it -- remembers its units per
     * condition and gives them back to the same conditions.
     *
     * Rows made before this change have all four at 0 ("unsplit"); their
     * units go back into the item's main condition, as before.
     */
    public function up(): void
    {
        foreach (['event_inventory_items', 'event_inventory_releases'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedInteger('new_quantity')->default(0)->after('quantity');
                $table->unsignedInteger('good_quantity')->default(0)->after('new_quantity');
                $table->unsignedInteger('fair_quantity')->default(0)->after('good_quantity');
                $table->unsignedInteger('poor_quantity')->default(0)->after('fair_quantity');
            });
        }
    }

    public function down(): void
    {
        foreach (['event_inventory_items', 'event_inventory_releases'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropColumn(['new_quantity', 'good_quantity', 'fair_quantity', 'poor_quantity']);
            });
        }
    }
};

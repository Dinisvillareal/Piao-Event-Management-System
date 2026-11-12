<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The earlier-photos list on returns and expenses becomes a full edit trail
 * (`activity_log`): what changed, who, when -- with any replaced photos kept on
 * the entry. Existing photo_history rows are carried over, then the old column
 * is dropped.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['event_inventory_releases', 'event_expenses'] as $table) {
            if (! Schema::hasColumn($table, 'activity_log')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->json('activity_log')->nullable();
                });
            }
            if (Schema::hasColumn($table, 'photo_history')) {
                DB::table($table)->whereNotNull('photo_history')->update(['activity_log' => DB::raw('photo_history')]);
                Schema::table($table, function (Blueprint $t) {
                    $t->dropColumn('photo_history');
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['event_inventory_releases', 'event_expenses'] as $table) {
            if (! Schema::hasColumn($table, 'photo_history')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->json('photo_history')->nullable();
                });
            }
            if (Schema::hasColumn($table, 'activity_log')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropColumn('activity_log');
                });
            }
        }
    }
};

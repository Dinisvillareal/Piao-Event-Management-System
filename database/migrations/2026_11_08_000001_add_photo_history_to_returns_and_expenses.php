<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Evidence photos are never deleted when staff replace or remove them. The old
 * files stay on disk and are listed in `photo_history` (photos, who, when) on
 * the return or expense they belonged to, so the original proof stays reachable.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['event_inventory_releases', 'event_expenses'] as $table) {
            if (! Schema::hasColumn($table, 'photo_history')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->json('photo_history')->nullable();
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['event_inventory_releases', 'event_expenses'] as $table) {
            if (Schema::hasColumn($table, 'photo_history')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropColumn('photo_history');
                });
            }
        }
    }
};

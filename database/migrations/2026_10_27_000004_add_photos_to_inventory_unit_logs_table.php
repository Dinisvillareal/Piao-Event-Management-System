<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Disposed / restored / found reports carry up to 5 evidence photos
     * (first one in photo_path, the rest in extra_photo_paths -- same pattern
     * as inventory items). The free-text reason is no longer used.
     */
    public function up(): void
    {
        Schema::table('inventory_unit_logs', function (Blueprint $table) {
            $table->json('extra_photo_paths')->nullable()->after('photo_path');
        });

        if (Schema::hasColumn('inventory_unit_logs', 'reason')) {
            Schema::table('inventory_unit_logs', function (Blueprint $table) {
                $table->dropColumn('reason');
            });
        }
    }

    public function down(): void
    {
        Schema::table('inventory_unit_logs', function (Blueprint $table) {
            $table->dropColumn('extra_photo_paths');
        });
    }
};

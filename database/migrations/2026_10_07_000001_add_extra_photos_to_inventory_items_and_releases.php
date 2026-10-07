<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Inventory items and return (release) evidence can now carry several
     * photos. The first one stays in the existing single-photo column
     * (photo_path / evidence_photo_path) as the cover; any others are kept
     * here as a JSON list of storage paths.
     */
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->json('extra_photo_paths')->nullable()->after('photo_path');
        });

        Schema::table('event_inventory_releases', function (Blueprint $table) {
            $table->json('extra_evidence_photo_paths')->nullable()->after('evidence_photo_path');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn('extra_photo_paths');
        });

        Schema::table('event_inventory_releases', function (Blueprint $table) {
            $table->dropColumn('extra_evidence_photo_paths');
        });
    }
};

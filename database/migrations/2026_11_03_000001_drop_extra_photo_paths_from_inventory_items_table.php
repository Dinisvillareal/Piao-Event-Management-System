<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An inventory item keeps exactly one photo (photo_path), so the
 * extra_photo_paths JSON column was never needed. Evidence photos for unit
 * corrections and returns live in their own tables and are not affected.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('inventory_items', 'extra_photo_paths')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                $table->dropColumn('extra_photo_paths');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('inventory_items', 'extra_photo_paths')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                $table->json('extra_photo_paths')->nullable()->after('photo_path');
            });
        }
    }
};

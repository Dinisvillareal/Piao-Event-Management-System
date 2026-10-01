<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds an optional photo to inventory items -- same pattern as
     * users.validation_id (Resident ID photo) and
     * event_expenses.receipt_path (expense receipt): a nullable string
     * column storing the path on the `public` disk, exposed to the
     * frontend as a full URL via a `photo_url` accessor on the model.
     */
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn('photo_path');
        });
    }
};
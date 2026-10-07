<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An expense receipt can now be up to 5 photos, or one PDF. The first
     * file stays in receipt_path; any further photos are kept here as a
     * JSON list of storage paths.
     */
    public function up(): void
    {
        Schema::table('event_expenses', function (Blueprint $table) {
            $table->json('extra_receipt_paths')->nullable()->after('receipt_path');
        });
    }

    public function down(): void
    {
        Schema::table('event_expenses', function (Blueprint $table) {
            $table->dropColumn('extra_receipt_paths');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A "found" report entered wrongly (wrong condition split, wrong item) can be
 * undone from the Units drawer. The entry is kept in the history, marked with
 * when and by whom it was undone, instead of being deleted, so the audit trail
 * stays whole. Undone found entries no longer count as found.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_unit_logs', function (Blueprint $table) {
            if (! Schema::hasColumn('inventory_unit_logs', 'undone_at')) {
                $table->timestamp('undone_at')->nullable()->after('user_code');
            }
            if (! Schema::hasColumn('inventory_unit_logs', 'undone_by')) {
                $table->string('undone_by')->nullable()->after('undone_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('inventory_unit_logs', function (Blueprint $table) {
            if (Schema::hasColumn('inventory_unit_logs', 'undone_by')) {
                $table->dropColumn('undone_by');
            }
            if (Schema::hasColumn('inventory_unit_logs', 'undone_at')) {
                $table->dropColumn('undone_at');
            }
        });
    }
};

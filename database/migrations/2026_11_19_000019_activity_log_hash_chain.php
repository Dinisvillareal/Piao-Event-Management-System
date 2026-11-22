<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tamper evidence for the activity log: every new row stores the fingerprint of the row before it
 * and its own fingerprint (see App\Support\AuditChain). The log is already add-only (migration
 * 2026_11_19_000018), so these two columns are written once, with the row, and never changed.
 * Rows saved earlier keep both empty and are not part of the chain.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->string('prev_hash', 64)->nullable()->after('ip_address');
            $table->string('row_hash', 64)->nullable()->after('prev_hash');
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropColumn(['prev_hash', 'row_hash']);
        });
    }
};

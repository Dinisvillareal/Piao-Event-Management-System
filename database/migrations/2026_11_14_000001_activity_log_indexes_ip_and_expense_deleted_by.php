<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * - activity_logs: remember which device (IP address) an action came from, and add indexes so
 *   searching / filtering a log of hundreds of thousands of rows stays fast.
 * - event_expenses: remember WHO deleted an expense (the Archive used to show who recorded it).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('activity_logs', 'ip_address')) {
                $table->string('ip_address', 45)->nullable()->after('description');
            }
            $table->index('created_at', 'activity_logs_created_at_index');
            $table->index(['module', 'created_at'], 'activity_logs_module_created_at_index');
            $table->index('user_code', 'activity_logs_user_code_index');
        });

        Schema::table('event_expenses', function (Blueprint $table) {
            if (!Schema::hasColumn('event_expenses', 'deleted_by')) {
                $table->string('deleted_by', 50)->nullable()->after('recorded_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropIndex('activity_logs_created_at_index');
            $table->dropIndex('activity_logs_module_created_at_index');
            $table->dropIndex('activity_logs_user_code_index');
            $table->dropColumn('ip_address');
        });

        Schema::table('event_expenses', function (Blueprint $table) {
            $table->dropColumn('deleted_by');
        });
    }
};

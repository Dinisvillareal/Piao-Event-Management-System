<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Age brackets and civil statuses were soft-deletable (see the
// 2026_09_03_120002 migration) but never recorded who deleted them --
// the Archive page had nothing to show but a hardcoded "SYSTEM", even
// when a real staff member did the deleting. Mirrors the deleted_by
// column already used on memberships/events/inventory_items/users.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('age_brackets', function (Blueprint $table) {
            $table->string('deleted_by')->nullable()->after('deleted_at');
        });
        Schema::table('civil_statuses', function (Blueprint $table) {
            $table->string('deleted_by')->nullable()->after('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::table('age_brackets', function (Blueprint $table) {
            $table->dropColumn('deleted_by');
        });
        Schema::table('civil_statuses', function (Blueprint $table) {
            $table->dropColumn('deleted_by');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            // null = open to everyone on that dimension (no restriction),
            // same convention as eligible_age_bracket_id / eligible_civil_status_id.
            $table->foreignId('eligible_current_status_id')->nullable()->after('eligible_civil_status_id')
                ->constrained('current_statuses')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->dropConstrainedForeignId('eligible_current_status_id');
        });
    }
};

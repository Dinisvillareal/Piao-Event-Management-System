<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            // null = open to everyone on that dimension (no restriction)
            $table->foreignId('eligible_age_bracket_id')->nullable()->after('description')
                ->constrained('age_brackets')->nullOnDelete();
            $table->foreignId('eligible_civil_status_id')->nullable()->after('eligible_age_bracket_id')
                ->constrained('civil_statuses')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->dropConstrainedForeignId('eligible_age_bracket_id');
            $table->dropConstrainedForeignId('eligible_civil_status_id');
        });
    }
};

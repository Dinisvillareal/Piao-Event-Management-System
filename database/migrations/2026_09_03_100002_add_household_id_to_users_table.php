<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Real household relationship. The old `household_code` (free text),
     * `household_contact_number`, and `is_household_head` columns are kept
     * as-is (nothing reads/writes them going forward, but dropping them
     * would lose existing data with no upside) -- new code should use
     * `household_id` + the `households` table instead.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('household_id')
                ->nullable()
                ->after('household_code')
                ->constrained('households')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('household_id');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Two additions to residents:
     *
     *  1. `suffix` (Jr., Sr., II, III ...). It also becomes part of the
     *     "unique active full name" key, so "Juan Cruz" and "Juan Cruz Jr."
     *     -- a very common father/son pair -- are allowed to coexist.
     *
     *  2. `barangay_position` ('captain' | 'secretary' | NULL): marks the
     *     resident who currently holds that post, so every report and the ID
     *     card can print the right name automatically. Only ONE active
     *     resident may hold each post. MySQL has no partial unique index, so
     *     (same trick as the household-head and unique-name constraints) a
     *     stored generated column is NULL for soft-deleted rows and equals the
     *     position for active rows, with a plain unique index on top. NULLs
     *     never collide, so everyone without a post is unaffected, and
     *     archiving the captain frees the post for a successor.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('suffix', 10)->nullable()->after('last_name');
            $table->string('barangay_position', 20)->nullable()->after('role');
        });

        // Rebuild the unique-name key so it includes the suffix.
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_unique_active_full_name');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('full_name_key');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->string('full_name_key', 450)
                ->nullable()
                ->storedAs("CASE WHEN deleted_at IS NULL THEN CONCAT(LOWER(TRIM(first_name)), '|', LOWER(TRIM(COALESCE(middle_name, ''))), '|', LOWER(TRIM(last_name)), '|', LOWER(TRIM(COALESCE(suffix, '')))) ELSE NULL END")
                ->after('last_name');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->unique('full_name_key', 'users_unique_active_full_name');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('barangay_position_key', 20)
                ->nullable()
                ->storedAs('CASE WHEN deleted_at IS NULL THEN barangay_position ELSE NULL END')
                ->after('barangay_position');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->unique('barangay_position_key', 'users_unique_active_barangay_position');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_unique_active_barangay_position');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('barangay_position_key');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_unique_active_full_name');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('full_name_key');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->string('full_name_key', 400)
                ->nullable()
                ->storedAs("CASE WHEN deleted_at IS NULL THEN CONCAT(LOWER(TRIM(first_name)), '|', LOWER(TRIM(COALESCE(middle_name, ''))), '|', LOWER(TRIM(last_name))) ELSE NULL END")
                ->after('last_name');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->unique('full_name_key', 'users_unique_active_full_name');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['suffix', 'barangay_position']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * UserController::store()/update() already run a PHP-level "does an
     * active resident with this full name already exist" check before
     * creating/updating a row, but that check-then-create was never
     * backed by a DB-level constraint -- two requests racing each other
     * (e.g. a double form submit, or two staff members adding the same
     * resident at the same time) could both pass the PHP check before
     * either commits, producing two active residents with the same name.
     *
     * MySQL has no native "unique on rows where X" (partial unique
     * index), so this uses the same workaround as
     * 2026_09_04_100002_enforce_single_household_head: a stored
     * generated column that is NULL for soft-deleted rows and equal to
     * the normalized "first|middle|last" name for every active row, with
     * a plain unique index on that column. MySQL/MariaDB treat every
     * NULL in a unique index as distinct from every other NULL, so only
     * active rows are actually constrained -- restoring an archived
     * resident, or archiving one to free up its name for someone else,
     * both keep working exactly as before.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('full_name_key', 400)
                ->nullable()
                ->storedAs("CASE WHEN deleted_at IS NULL THEN CONCAT(LOWER(TRIM(first_name)), '|', LOWER(TRIM(COALESCE(middle_name, ''))), '|', LOWER(TRIM(last_name))) ELSE NULL END")
                ->after('last_name');
        });

        // Defensive cleanup: if any active residents already share a full
        // name (exactly the bug this migration closes off), keep the
        // most recently created one and archive the rest -- otherwise
        // creating the unique index below would fail on existing data.
        // The users table has no timestamps, so "most recently created"
        // means the highest id (deterministic tie-break).
        $duplicateIds = DB::table('users')
            ->select('id', DB::raw("CONCAT(LOWER(TRIM(first_name)), '|', LOWER(TRIM(COALESCE(middle_name, ''))), '|', LOWER(TRIM(last_name))) as name_key"))
            ->whereNull('deleted_at')
            ->orderByDesc('id')
            ->get()
            ->groupBy('name_key')
            ->flatMap(fn ($rows) => $rows->slice(1)->pluck('id'));

        if ($duplicateIds->isNotEmpty()) {
            DB::table('users')->whereIn('id', $duplicateIds)->update([
                'deleted_at' => now(),
                'deleted_by' => 'SYSTEM',
            ]);
        }

        Schema::table('users', function (Blueprint $table) {
            $table->unique('full_name_key', 'users_unique_active_full_name');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_unique_active_full_name');
            $table->dropColumn('full_name_key');
        });
    }
};

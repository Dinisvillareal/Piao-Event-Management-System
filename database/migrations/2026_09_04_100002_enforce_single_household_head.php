<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A household must never have more than one is_household_head = true
     * member -- application code already tries to enforce this (demote
     * the old head before promoting a new one), but that was only ever
     * checked in PHP, not guaranteed by the database. One missed spot
     * (HouseholdController::addMember not clearing a resident's stale
     * head flag when linking them into a household -- fixed alongside
     * this migration) was enough to let a household end up with two.
     *
     * MySQL has no native "unique on rows where X is true" (partial
     * unique index), so this uses the standard workaround: a stored
     * generated column that is NULL for every non-head row and equal to
     * household_id for the (at most one) head row, with a plain unique
     * index on that column. MySQL/MariaDB treat every NULL in a unique
     * index as distinct from every other NULL, so only the "head" rows
     * are actually constrained -- any second row for the same household
     * with is_household_head = 1 fails to insert/update at the DB level,
     * no matter which code path produced it.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('household_head_of')
                ->nullable()
                ->storedAs('CASE WHEN is_household_head = 1 THEN household_id ELSE NULL END')
                ->after('is_household_head');
        });

        // Defensive cleanup: if any household already has more than one
        // member flagged as head (exactly the bug this migration closes
        // off), keep one and demote the rest -- otherwise creating the
        // unique index below would fail on existing data. The users
        // table here has no timestamps (see its migration), so there's
        // no "most recently updated" to prefer; keep the highest id
        // (the most recently created row) as a deterministic tie-break.
        $duplicateHeadIds = DB::table('users')
            ->select('id', 'household_id')
            ->whereNotNull('household_id')
            ->where('is_household_head', true)
            ->orderByDesc('id')
            ->get()
            ->groupBy('household_id')
            ->flatMap(fn ($rows) => $rows->slice(1)->pluck('id'));

        if ($duplicateHeadIds->isNotEmpty()) {
            DB::table('users')->whereIn('id', $duplicateHeadIds)->update(['is_household_head' => false]);
        }

        Schema::table('users', function (Blueprint $table) {
            $table->unique('household_head_of', 'users_one_head_per_household');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_one_head_per_household');
            $table->dropColumn('household_head_of');
        });
    }
};

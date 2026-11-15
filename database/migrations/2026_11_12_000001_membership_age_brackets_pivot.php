<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A membership can now be open to MORE THAN ONE age bracket
 * (e.g. "Youth" + "Adult"). Nothing picked still means "any age".
 *
 * The single memberships.eligible_age_bracket_id column is replaced by the
 * membership_age_bracket link table. Every existing value is copied across
 * first, so no program loses its age rule.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('membership_age_bracket', function (Blueprint $table) {
            $table->id();
            $table->foreignId('membership_id')->constrained('memberships')->cascadeOnDelete();
            $table->foreignId('age_bracket_id')->constrained('age_brackets')->cascadeOnDelete();
            $table->unique(['membership_id', 'age_bracket_id']);
        });

        DB::table('memberships')
            ->whereNotNull('eligible_age_bracket_id')
            ->orderBy('id')
            ->get(['id', 'eligible_age_bracket_id'])
            ->each(fn ($m) => DB::table('membership_age_bracket')->insert([
                'membership_id'  => $m->id,
                'age_bracket_id' => $m->eligible_age_bracket_id,
            ]));

        Schema::table('memberships', function (Blueprint $table) {
            $table->dropConstrainedForeignId('eligible_age_bracket_id');
        });
    }

    public function down(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->foreignId('eligible_age_bracket_id')->nullable()->after('description')
                ->constrained('age_brackets')->nullOnDelete();
        });

        // A single column can only hold one bracket: keep the first (lowest id).
        DB::table('membership_age_bracket')
            ->orderBy('id')
            ->get()
            ->unique('membership_id')
            ->each(fn ($row) => DB::table('memberships')
                ->where('id', $row->membership_id)
                ->update(['eligible_age_bracket_id' => $row->age_bracket_id]));

        Schema::dropIfExists('membership_age_bracket');
    }
};

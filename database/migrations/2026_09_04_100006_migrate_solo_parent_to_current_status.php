<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * One-time data move: "Solo Parent" was seeded into civil_statuses
     * (see 2026_08_28_000002_create_civil_statuses_table, now trimmed to
     * stop reseeding it) even though it isn't a marital status. This
     * carries any existing resident/membership references over to the
     * new current_statuses table instead of just dropping them, then
     * removes the old civil_statuses row.
     *
     * A resident who had civil_status_id pointing at "Solo Parent" ends
     * up with current_status_id set to the new row and civil_status_id
     * cleared -- there's no way to recover what their actual marital
     * status was meant to be, since the old data never recorded one.
     */
    public function up(): void
    {
        $old = DB::table('civil_statuses')->where('label', 'Solo Parent')->first();
        if (!$old) {
            return;
        }

        $newId = DB::table('current_statuses')->insertGetId([
            'label'      => 'Solo Parent',
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('users')->where('civil_status_id', $old->id)->update([
            'current_status_id' => $newId,
        ]);
        DB::table('users')->where('civil_status_id', $old->id)->update([
            'civil_status_id' => null,
        ]);

        DB::table('memberships')->where('eligible_civil_status_id', $old->id)->update([
            'eligible_current_status_id' => $newId,
        ]);
        DB::table('memberships')->where('eligible_civil_status_id', $old->id)->update([
            'eligible_civil_status_id' => null,
        ]);

        DB::table('civil_statuses')->where('id', $old->id)->delete();
    }

    public function down(): void
    {
        $new = DB::table('current_statuses')->where('label', 'Solo Parent')->first();
        if (!$new) {
            return;
        }

        $oldId = DB::table('civil_statuses')->insertGetId([
            'label'      => 'Solo Parent',
            'sort_order' => 5,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('users')->where('current_status_id', $new->id)->update([
            'civil_status_id' => $oldId,
        ]);
        DB::table('users')->where('current_status_id', $new->id)->update([
            'current_status_id' => null,
        ]);

        DB::table('memberships')->where('eligible_current_status_id', $new->id)->update([
            'eligible_civil_status_id' => $oldId,
        ]);
        DB::table('memberships')->where('eligible_current_status_id', $new->id)->update([
            'eligible_current_status_id' => null,
        ]);

        DB::table('current_statuses')->where('id', $new->id)->delete();
    }
};

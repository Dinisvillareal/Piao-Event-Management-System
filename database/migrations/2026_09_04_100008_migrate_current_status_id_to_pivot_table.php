<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Carries over every existing users.current_status_id value into the
     * new current_status_user pivot table, then drops the now-redundant
     * column (and its FK) -- current_statuses() on the User model reads
     * from the pivot from here on. Safe to run on a fresh install too:
     * the SELECT below simply returns nothing if the column has no data
     * yet.
     */
    public function up(): void
    {
        $rows = DB::table('users')
            ->select('id', 'current_status_id')
            ->whereNotNull('current_status_id')
            ->get();

        if ($rows->isNotEmpty()) {
            $now = now();
            DB::table('current_status_user')->insert(
                $rows->map(fn ($row) => [
                    'user_id'            => $row->id,
                    'current_status_id'  => $row->current_status_id,
                    'created_at'         => $now,
                    'updated_at'         => $now,
                ])->all()
            );
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('current_status_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('current_status_id')->nullable()->after('civil_status_id')
                ->constrained('current_statuses')->nullOnDelete();
        });

        // Best-effort only -- a user with more than one pivot row can't
        // fit back into a single column, so this keeps their
        // lowest-id (oldest) current status and drops the rest.
        $oneEach = DB::table('current_status_user')
            ->select('user_id', 'current_status_id')
            ->orderBy('current_status_id')
            ->get()
            ->groupBy('user_id')
            ->map(fn ($rows) => $rows->first()->current_status_id);

        foreach ($oneEach as $userId => $currentStatusId) {
            DB::table('users')->where('id', $userId)->update(['current_status_id' => $currentStatusId]);
        }
    }
};

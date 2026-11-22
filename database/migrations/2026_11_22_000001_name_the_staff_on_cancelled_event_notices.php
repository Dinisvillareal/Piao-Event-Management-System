<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Cancelled-event notices written before the staff name was kept in them read only
 * "We apologize for the inconvenience...". Give each one the same "Staff: <last name> • <event>"
 * start as every other notice, using the staff member who archived the event.
 * Safe to run again: it only touches notices that do not have the start yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('notifications as n')
            ->join('events as e', 'e.id', '=', 'n.event_id')
            ->leftJoin('users as u', 'u.user_code', '=', 'e.deleted_by')
            ->where('n.type', 'event_deleted')
            ->where('n.message', 'not like', '%•%')
            ->get(['n.id', 'e.name as event_name', 'u.last_name as staff_last']);

        foreach ($rows as $r) {
            if (!$r->staff_last) {
                continue; // nobody recorded as the one who archived it
            }
            try {
                DB::table('notifications')->where('id', $r->id)->update([
                    'message' => 'Staff: ' . $r->staff_last . ' • ' . $r->event_name . ' — Event cancelled. We apologize for the inconvenience.',
                ]);
            } catch (\Throwable $e) {
                // a lock on the table: leave this notice as it was
            }
        }
    }

    public function down(): void
    {
        // the older wording is not restored
    }
};

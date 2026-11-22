<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Models\EventAttendance;
use App\Models\User;
use App\Support\AttendanceLedger;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * Attendance for the events of 21-22 November 2026, the way a real day looks:
 *
 *   - everyone an event is meant for gets a row (like the app does when staff post the event);
 *   - most people come, sign in a little after the gate opens, and sign out after the event ends (Complete);
 *   - a few sign in but forget to sign out (Incomplete);
 *   - a few do not come at all (missed).
 *
 * It follows the clock: an event that has not opened yet has only "missed" placeholders, and an
 * event that is still running has sign-ins but no sign-outs. No time is ever in the future.
 * Each scan also gets its activity-log line (who was at the gate, who signed in or out, when).
 * The scans are then written into the attendance ledger so every row agrees with it from the start.
 *
 *     php artisan db:seed --class=HumanAttendanceSeeder
 *
 * Safe to run again: people who already have a sign-in are left as they are.
 * Needs the events to exist already (HumanDemoSeeder calls this seeder itself).
 */
class HumanAttendanceSeeder extends Seeder
{
    /** Same mix for every event, by the person's place in the list: 6 Complete, 2 Incomplete, 2 missed of every 10. */
    private const MIX = ['complete', 'complete', 'incomplete', 'complete', 'complete', 'missed', 'complete', 'incomplete', 'complete', 'missed'];

    /** Members who could not come, so the demo has real absences (they explain why in HumanFeedbackSeeder). */
    private const SKIPPED = [
        'Barangay Clean-Up Drive' => ['Nenita'],
        'Barangay Assembly' => ['Rosario'],
    ];

    /** Minutes after the gate opens (sign-in) and after the event ends (sign-out) that people actually tap. */
    private const ARRIVE = [4, 9, 14, 20, 27, 33, 41, 48];
    private const LEAVE = [0, 4, 7, 11, 16, 22];

    public function run(): void
    {
        $now = now();
        $staff = DemoLog::staff();

        $events = Event::withoutTrashed()
            ->whereBetween('event_start', ['2026-11-21 00:00:00', '2026-11-22 23:59:59'])
            ->orderBy('event_start')
            ->get();

        foreach ($events as $event) {
            if ($event->attendances()->count() === 0) {
                $event->createAttendanceRecords();
            }

            $open = Carbon::parse($event->call_time_start ?? $event->event_start);
            $start = Carbon::parse($event->event_start);
            $end = Carbon::parse($event->event_end ?? $event->event_start);
            $signOutClose = $event->call_time_end ? Carbon::parse($event->call_time_end) : $end->copy()->addMinutes(30);

            if ($open->greaterThan($now)) {
                continue; // the gate has not opened yet: everyone stays "missed"
            }

            $skippedIds = User::whereIn('first_name', self::SKIPPED[$event->name] ?? [])->pluck('id')->all();
            $rows = $event->attendances()->orderBy('id')->get(); // everyone, so a person keeps the same place in the mix on every run
            foreach ($rows->values() as $n => $row) {
                if ($row->time_in !== null) {
                    continue; // already scanned (the seeder ran before): leave it as it is
                }
                $outcome = in_array($row->user_id, $skippedIds, true) ? 'missed' : self::MIX[$n % count(self::MIX)];
                if ($outcome === 'missed') {
                    continue;
                }

                $in = $open->copy()->addMinutes(self::ARRIVE[$n % count(self::ARRIVE)]);
                if ($in->greaterThan($start)) {
                    $in = $start->copy();            // sign-in closes when the event starts
                }
                if ($in->greaterThan($now)) {
                    $in = $now->copy()->subMinute(); // never in the future
                }
                if ($in->lessThan($open)) {
                    continue; // the gate opened a moment ago: nobody has tapped in yet
                }

                $out = null;
                $status = 'Incomplete';
                if ($outcome === 'complete' && $end->lessThanOrEqualTo($now)) {
                    $out = $end->copy()->addMinutes(self::LEAVE[$n % count(self::LEAVE)]);
                    if ($out->greaterThan($signOutClose)) {
                        $out = $signOutClose->copy();
                    }
                    if ($out->greaterThan($now)) {
                        $out = $now->copy()->subMinute();
                    }
                    $status = 'Complete';
                }

                // the staff member at the gate scans the member's QR code: one line for the sign-in, one for the sign-out
                $gate = $staff[$row->id % max(1, count($staff))] ?? null;
                $member = DemoLog::name(User::find($row->user_id));
                DemoLog::write($gate?->user_code, 'Time In', 'QR', "{$member} signed in to {$event->name}", $in);
                if ($out) {
                    DemoLog::write($gate?->user_code, 'Time Out', 'QR', "{$member} signed out of {$event->name}", $out);
                }

                EventAttendance::where('id', $row->id)->update([
                    'time_in' => $in->format('Y-m-d H:i:s'),
                    'time_out' => $out?->format('Y-m-d H:i:s'),
                    'status' => $status,
                    'updated_at' => now(),   // the moment of this write, never earlier than the row's own time
                ]);
            }
        }

        // write the scans above into the ledger, so the ledger and the rows agree
        AttendanceLedger::adopt();
    }
}

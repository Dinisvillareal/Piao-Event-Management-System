<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\EventAttendance;
use App\Models\Event;
use Carbon\Carbon;

class EventAttendanceSeeder extends Seeder
{
    /**
     * Mirrors what Event::createAttendanceRecords() does in real usage
     * (triggered from EventController::store() the moment staff creates an
     * event) -- but EventSeeder builds its events with Event::create()
     * directly, which bypasses that controller hook entirely. Without this
     * seeder, every seeded event would sit at zero attendance rows, which
     * is not what a barangay that has actually been running this system
     * for a few months would look like.
     *
     * For every event, every eligible resident (same getEligibleResidents()
     * rule the real app uses, so membership-scoped events only seed rows
     * for residents who actually qualify) gets a baseline row. Events that
     * have already started by the time THIS seeder runs get a realistic
     * mix of Complete / Incomplete / missed outcomes with real time_in and
     * time_out values pulled from that event's own schedule -- events that
     * are still upcoming are left as pure 'missed' placeholders, exactly
     * like a real event nobody has attended yet.
     */
    public function run(): void
    {
        $now = Carbon::now();

        Event::withoutTrashed()->get()->each(function (Event $event) use ($now) {
            $residents = $event->getEligibleResidents();

            if ($residents->isEmpty()) {
                return;
            }

            $eventStart = Carbon::parse($event->event_start);
            $hasHappened = $eventStart->lessThanOrEqualTo($now);

            $rows = [];

            foreach ($residents->values() as $index => $resident) {
                $outcome = $hasHappened ? $this->rollOutcome($index) : 'missed';
                [$timeIn, $timeOut, $status] = $this->timesFor($event, $outcome);

                $rows[] = [
                    'event_id' => $event->id,
                    'user_id' => $resident->id,
                    'time_in' => $timeIn,
                    'time_out' => $timeOut,
                    'status' => $status,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            EventAttendance::insert($rows);
        });
    }

    /**
     * Realistic attendance mix for an event that has already happened --
     * roughly 70% Complete (signed in and out), 15% Incomplete (signed in,
     * left early / forgot to tap out), 15% missed entirely despite being
     * eligible. Picked off the resident's position in the eligible list
     * rather than pure random, so the split stays close to those ratios
     * even for events with only a handful of eligible residents.
     */
    private function rollOutcome(int $index): string
    {
        $bucket = $index % 20;
        if ($bucket < 14) return 'complete';
        if ($bucket < 17) return 'incomplete';
        return 'missed';
    }

    private function timesFor(Event $event, string $outcome): array
    {
        if ($outcome === 'missed') {
            return [null, null, 'missed'];
        }

        $start = Carbon::parse($event->call_time_start ?? $event->event_start);
        $end = Carbon::parse($event->event_end ?? $event->event_start);

        // A believable spread of arrival times around the call time,
        // instead of every attendee clocking in at the exact same second.
        $arrivalOffsets = [-10, -5, 0, 3, 8, 12, 18, 25, 30, 40];
        $timeIn = $start->copy()->addMinutes($arrivalOffsets[array_rand($arrivalOffsets)]);
        if ($timeIn->greaterThan($end)) {
            // Never let a "late" arrival land after the event has ended.
            $timeIn = $end->copy()->subMinutes(5);
        }

        if ($outcome === 'incomplete') {
            return [$timeIn->format('Y-m-d H:i:s'), null, 'Incomplete'];
        }

        $departureOffsets = [-15, -10, -5, 0, 5, 10, 15];
        $timeOut = $end->copy()->addMinutes($departureOffsets[array_rand($departureOffsets)]);
        if ($timeOut->lessThan($timeIn)) {
            $timeOut = $timeIn->copy()->addMinutes(30);
        }

        return [$timeIn->format('Y-m-d H:i:s'), $timeOut->format('Y-m-d H:i:s'), 'Complete'];
    }
}

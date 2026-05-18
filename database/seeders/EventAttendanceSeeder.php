<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\EventAttendance;
use App\Models\Event;
use App\Models\User;

class EventAttendanceSeeder extends Seeder
{
    public function run(): void
    {
        // Get 5 Staff and 5 Residents
        $staff = User::where('role', 'Staff')->take(5)->get();
        $residents = User::where('role', 'Resident')->take(5)->get();

        $users = $staff->concat($residents);

        // Get only ONE event
        $event = Event::first();

        if (!$event) {
            return;
        }

        $attendances = [];

        $timeInSamples = [
            '08:00:00',
            '08:15:00',
            '08:30:00',
            '09:00:00',
            '09:15:00',
        ];

        $timeOutSamples = [
            '12:00:00',
            '12:15:00',
            '12:30:00',
            '13:00:00',
            '13:15:00',
        ];

        $dateOnly = substr($event->event_start, 0, 10);

        foreach ($users as $index => $user) {

            $timeIn = $dateOnly . ' ' . $timeInSamples[$index % count($timeInSamples)];

            $isComplete = rand(1, 10) <= 8;

            if ($isComplete) {
                $timeOut = $dateOnly . ' ' . $timeOutSamples[$index % count($timeOutSamples)];
                $status = 'Complete';
            } else {
                $timeOut = null;
                $status = 'Incomplete';
            }

            $attendances[] = [
                'event_id' => $event->id,
                'user_id' => $user->id,
                'time_in' => $timeIn,
                'time_out' => $timeOut,
                'status' => $status,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        EventAttendance::insert($attendances);
    }
}
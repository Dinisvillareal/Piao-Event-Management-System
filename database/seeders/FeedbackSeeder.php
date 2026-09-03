<?php

namespace Database\Seeders;

use App\Models\EventAttendance;
use App\Models\Feedback;
use Illuminate\Database\Seeder;

class FeedbackSeeder extends Seeder
{
    /**
     * Post-event feedback for the attendees EventAttendanceSeeder already
     * signed in -- FeedbackController::store() only allows feedback from a
     * user with a real time_in on that event, so this reuses those exact
     * attendance rows instead of inventing unrelated users/events.
     */
    public function run(): void
    {
        $comments = [
            5 => ['Well organized event, learned a lot!', 'Great turnout and very informative session.', null],
            4 => ['Good event overall, venue was a bit cramped.', 'Enjoyed it, would join again.', null],
            3 => ['It was okay, could start on time next time.', null],
        ];

        $attendees = EventAttendance::whereNotNull('time_in')->with('user')->get();

        foreach ($attendees as $index => $attendance) {
            if (!$attendance->user) {
                continue;
            }

            $rating = $attendance->status === 'Complete' ? [4, 5][$index % 2] : 3;
            $options = $comments[$rating];
            $comment = $options[$index % count($options)];

            Feedback::firstOrCreate(
                ['event_id' => $attendance->event_id, 'user_id' => $attendance->user_id],
                ['rating' => $rating, 'comment' => $comment]
            );
        }
    }
}

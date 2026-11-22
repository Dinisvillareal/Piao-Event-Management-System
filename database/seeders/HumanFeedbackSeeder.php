<?php

namespace Database\Seeders;

use App\Models\AbsenceReason;
use App\Models\AppSetting;
use App\Models\Event;
use App\Models\EventAttendance;
use App\Models\Feedback;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * What the members with an account say after the events of 21-22 November 2026, in their own words (Bisaya):
 *
 *   - a member who CAME to an event that is over leaves feedback: stars and a short comment;
 *   - a member who did NOT come tells the barangay why (an absence reason);
 *   - the Secretary (Head Staff) hearts some of them and replies to a few;
 *   - the staff get a "sent feedback" notification, and the member gets one for each heart or reply.
 *
 * Only members who have an account can do this in the real system, so only they appear here.
 * Each of these also gets its activity-log line.
 * It follows the clock like the attendance does: nothing is written for an event that is not over yet,
 * and no time is ever in the future.
 *
 *     php artisan db:seed --class=HumanFeedbackSeeder
 *
 * Needs the events, the people and their attendance (HumanDemoSeeder runs this seeder itself).
 * Safe to run again: what is already there is skipped, nothing is written twice.
 */
class HumanFeedbackSeeder extends Seeder
{
    /** event name => first name => [stars, comment, did the Secretary heart it, her reply or null] */
    private const FEEDBACK = [
        'Barangay Clean-Up Drive' => [
            'Rosario' => [5, 'Nalipay ko kay daghan mi nagtinabangay. Mas limpyo na ang atong dalan karon. Salamat sa tanan!', true, 'Salamat kaayo, Nanay Rosario! Padayon ta sa paghinlo sa atong barangay.'],
        ],
        'Barangay Assembly' => [
            'Nenita' => [4, 'Nindot ang miting, nasabtan nako ang report sa pondo. Mas maayo unta kung mosugod sa saktong oras kay naghulat mi.', true, 'Salamat sa imong puna, Nanay Nenita. Atong sugdan sa saktong oras sa sunod nga assembly.'],
        ],
        'Feeding Program for Kids' => [
            'Rosario' => [5, 'Salamat kaayo sa pagkaon sa among mga bata. Busog sila ug nakadawat pa og bitamina. Mabuhi ang Walang Gutom!', true, null],
            'Nenita' => [5, 'Init pa ang tinola ug lami gyud. Salamat sa mga staff nga mitabang.', false, null],
        ],
        'Family Development Session' => [
            'Rosario' => [4, 'Daghan kog nakat-unan bahin sa pagbadyet sa panimalay. Ugma-ugma unta naay dugang nga session.', false, null],
        ],
    ];

    /** event name => first name => [reason code, comment, did the Secretary heart it, her reply or null] */
    private const ABSENCE = [
        'Barangay Clean-Up Drive' => [
            'Nenita' => ['work_family', 'Gibantayan nako si Mama kay wala siya kaayo\'y kusog. Pasayloa ko, muapil ko sa sunod.', true, 'Sige lang, Nanay Nenita. Pag-amping kang Nanay Cresing, ug hangyo nga mutambong ka sa sunod.'],
        ],
        'Barangay Assembly' => [
            'Rosario' => ['sick', 'Nilagnat akong anak, gidala nako sa health center. Pasaylo kaayo.', true, null],
        ],
    ];

    /** For a member the lists above do not name (for example after the demo is edited): plain Bisaya by stars. */
    private const GENERIC = [
        5 => 'Maayo kaayo ang kalihokan. Salamat sa barangay!',
        4 => 'Nindot ang kalihokan, mas maayo pa kung mas organisado.',
        3 => 'Okay ra ang kalihokan, pero mas maayo unta kung dili ka dugay ang sugod.',
    ];

    public function run(): void
    {
        $now = now();
        $rules = AppSetting::feedbackRules();

        $head = User::where('is_head_staff', true)->first() ?? User::where('role', 'Staff')->orderBy('id')->first();
        $staffIds = User::where('role', 'Staff')->pluck('id');
        $members = User::where('role', 'Resident')->where('has_account', 1)->orderBy('id')->get();

        if (!$head || $members->isEmpty()) {
            $this->command?->warn('No staff or no resident with an account found: no feedback was written.');
            return;
        }

        $events = Event::withoutTrashed()
            ->whereBetween('event_start', ['2026-11-21 00:00:00', '2026-11-22 23:59:59'])
            ->orderBy('event_start')
            ->get();

        $notifications = [];

        foreach ($events as $event) {
            $end = Carbon::parse($event->event_end ?? $event->event_start);
            if ($end->greaterThanOrEqualTo($now)) {
                continue; // not over yet: nobody can rate it or explain an absence
            }

            foreach ($members as $m) {
                $attendance = EventAttendance::where('event_id', $event->id)->where('user_id', $m->id)->first();
                if (!$attendance) {
                    continue; // the event was not meant for this member
                }

                $name = trim($m->first_name . ' ' . $m->last_name);
                $came = $attendance->time_in !== null || $attendance->time_out !== null;

                // already written (for example the demo seeder ran first): do not write it twice
                $exists = $came
                    ? Feedback::where('event_id', $event->id)->where('user_id', $m->id)->exists()
                    : AbsenceReason::where('event_id', $event->id)->where('user_id', $m->id)->exists();
                if ($exists) {
                    continue;
                }

                if ($came) {
                    [$stars, $comment, $liked, $reply] = self::FEEDBACK[$event->name][$m->first_name]
                        ?? [5, self::GENERIC[5], false, null];

                    $at = $this->after($end, 90, $now);
                    if ($at === null) {
                        continue;
                    }
                    $row = new Feedback();
                    $row->forceFill([
                        'event_id' => $event->id,
                        'user_id' => $m->id,
                        'rating' => $stars,
                        'comment' => $comment,
                        'close_after_hours' => $rules['close_after_hours'],
                        'edit_window_minutes' => $rules['edit_window_minutes'],
                        'created_at' => $at,
                        'updated_at' => $at,
                    ]);
                    $label = $stars . '/5';
                    $kind = 'feedback';
                    $title = $name . ' sent feedback';
                } else {
                    [$reasonCode, $comment, $liked, $reply] = self::ABSENCE[$event->name][$m->first_name]
                        ?? ['not_informed', 'Wala ko mahibaw-i nga naay kalihokan karon. Pasayloa ko.', false, null];

                    $at = $this->after($end, 360, $now);
                    if ($at === null) {
                        continue;
                    }
                    $row = new AbsenceReason();
                    $row->forceFill([
                        'event_id' => $event->id,
                        'user_id' => $m->id,
                        'reason' => $reasonCode,
                        'comment' => $comment,
                        'created_at' => $at,
                        'updated_at' => $at,
                    ]);
                    $label = AbsenceReason::REASONS ? $this->reasonLabel($reasonCode) : $reasonCode;
                    $kind = 'response';
                    $title = $name . ' sent a reason for not attending';
                }

                // the Secretary hearts it, then replies; the member may heart the reply
                $likedAt = $liked ? $this->after($at, 40, $now) : null;
                $repliedAt = $reply ? $this->after($at, 120, $now) : null;
                $row->staff_liked_at = $likedAt;
                if ($reply && $repliedAt) {
                    $row->staff_reply = $reply;
                    $row->staff_replied_at = $repliedAt;
                    $row->staff_replied_by = $head->id;
                    $row->member_liked_reply_at = $this->after($repliedAt, 30, $now);
                }
                $row->save();

                // the activity log, in the order it happened: the member writes, the Secretary hearts and replies, the member hearts the reply
                if ($came) {
                    DemoLog::write($m->user_code, 'Create', 'Feedback', "Submitted feedback for event '{$event->name}' (rating {$stars}/5)", $at);
                }
                if ($likedAt) {
                    DemoLog::write($head->user_code, 'Like Feedback', 'Feedback', "Staff liked the " . ($came ? 'feedback' : 'reason for not attending') . " for event '{$event->name}'", $likedAt);
                }
                if ($reply && $repliedAt) {
                    DemoLog::write($head->user_code, 'Reply', 'Feedback', "Staff replied to feedback for event '{$event->name}'", $repliedAt);
                    if ($row->member_liked_reply_at) {
                        DemoLog::write($m->user_code, 'Like Reply', 'Feedback', "Resident liked the staff reply for event '{$event->name}'", Carbon::parse($row->member_liked_reply_at));
                    }
                }

                // notifications, written the way the app writes them
                $note = fn ($userId, $type, $ttl, $msg, $when, $read) => [
                    'user_id' => $userId, 'event_id' => $event->id, 'type' => $type, 'title' => $ttl,
                    'message' => $msg, 'read' => $read, 'created_at' => $when, 'updated_at' => $when,
                ];
                foreach ($staffIds as $sid) {
                    $notifications[] = $note($sid, 'feedback_received', $title, '"' . $event->name . '" - ' . $label . "\n" . $comment, $at, true);
                }
                if ($likedAt) {
                    $notifications[] = $note($m->id, 'feedback_reply', "Barangay staff liked your {$kind}", '"' . $event->name . '"', $likedAt, true);
                }
                if ($repliedAt) {
                    $notifications[] = $note($m->id, 'feedback_reply', "Barangay staff replied to your {$kind}", '"' . $event->name . "\"\n" . $reply, $repliedAt, false);
                }
            }
        }

        if ($notifications) {
            Notification::insert($notifications);
        }
    }

    /** $minutes after $from, but never later than a minute ago; null if that would not be after $from. */
    private function after(Carbon $from, int $minutes, Carbon $now): ?Carbon
    {
        $t = $from->copy()->addMinutes($minutes);
        $limit = $now->copy()->subMinute();
        if ($t->greaterThan($limit)) {
            $t = $limit;
        }

        return $t->greaterThan($from) ? $t : null;
    }

    private function reasonLabel(string $code): string
    {
        return [
            'schedule' => 'Schedule conflict',
            'sick' => 'Sick or unwell',
            'not_informed' => "Didn't know about it",
            'no_transport' => 'No transportation',
            'work_family' => 'Work or family duties',
            'not_interested' => 'Not interested',
            'other' => 'Other',
        ][$code] ?? $code;
    }
}

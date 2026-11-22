<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const LABELS = [
        'schedule' => 'Schedule conflict', 'sick' => 'Sick or unwell', 'not_informed' => "Didn't know about it",
        'no_transport' => 'No transportation', 'work_family' => 'Work or family duties', 'not_interested' => 'Not interested', 'other' => 'Other',
    ];

    /**
     * Feedback notifications written between 26 Oct and now carry English sentences
     * ("New feedback received", "Maria rated ...") that the bell and the inboxes cannot
     * read, so they showed no name, no comment, no reason and could not be translated.
     * This rewrites them into the shape the screens read (see FeedbackController).
     * Rows already in that shape are left alone, so it is safe to run twice.
     */
    public function up(): void
    {
        $eventName = fn ($id) => $id ? (DB::table('events')->where('id', $id)->value('name') ?? 'an event') : 'an event';

        // Staff: a rating
        DB::table('notifications')->where('title', 'New feedback received')->orderBy('id')->get()->each(function ($n) {
            if (! preg_match('/^(.+?) rated "(.*)": (\d)\/5(?: — (.*))?$/su', (string) $n->message, $m)) {
                return;
            }
            DB::table('notifications')->where('id', $n->id)->update([
                'title'   => $m[1] . ' sent feedback',
                'message' => '"' . $m[2] . '" - ' . $m[3] . '/5' . (isset($m[4]) && trim($m[4]) !== '' ? "\n" . $m[4] : ''),
            ]);
        });

        // Staff: a reason for not attending
        DB::table('notifications')->where('title', "Couldn't attend reported")->orderBy('id')->get()->each(function ($n) {
            if (! preg_match('/^(.+?) reported couldn\'t attend "(.*)": (.+)$/su', (string) $n->message, $m)) {
                return;
            }
            DB::table('notifications')->where('id', $n->id)->update([
                'title'   => $m[1] . ' sent a reason for not attending',
                'message' => '"' . $m[2] . '" - ' . (self::LABELS[$m[3]] ?? $m[3]),
            ]);
        });

        // Staff: a member liked their reply
        DB::table('notifications')->where('title', 'Member liked your reply')->orderBy('id')->get()->each(function ($n) use ($eventName) {
            if (! preg_match('/^(.+?) liked your reply on their (feedback|reason)\.$/su', (string) $n->message, $m)) {
                return;
            }
            $kind = $m[2] === 'reason' ? 'response' : 'feedback';
            $table = $kind === 'response' ? 'absence_reasons' : 'feedback';
            $reply = DB::table($table)->where('event_id', $n->event_id)->where('staff_replied_by', $n->user_id)->value('staff_reply');
            DB::table('notifications')->where('id', $n->id)->update([
                'title'   => $m[1] . ' liked your reply on their ' . $kind,
                'message' => '"' . $eventName($n->event_id) . "\"\n" . ($reply ?? ''),
            ]);
        });

        // Members: a heart or a reply from staff (message used to be only the reply text / a sentence)
        DB::table('notifications')->where('type', 'feedback_reply')->where('title', 'like', 'Barangay staff %')->orderBy('id')->get()->each(function ($n) use ($eventName) {
            if (str_starts_with((string) $n->message, '"')) {
                return;
            }
            $title = str_replace('your reason', 'your response', (string) $n->title);
            $line = '"' . $eventName($n->event_id) . '"';
            DB::table('notifications')->where('id', $n->id)->update([
                'title'   => $title,
                'message' => str_contains($title, 'liked') ? $line : $line . "\n" . $n->message,
            ]);
        });
    }

    public function down(): void
    {
        // The old shape cannot be rebuilt (and was the bug); nothing to undo.
    }
};

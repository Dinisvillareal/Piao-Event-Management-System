<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventAttendance;
use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * The staff bell, the Notifications page and the member's inbox read feedback notifications by
 * their shape and word them in the reader's own language, so the shape has to stay put.
 */
class FeedbackNotificationsTest extends TestCase
{
    use RefreshDatabase, Support;

    private function resident(string $first = 'Maria', string $last = 'Santos')
    {
        return $this->makeUser('Resident', ['first_name' => $first, 'last_name' => $last]);
    }

    private function attendedEvent($resident): Event
    {
        $e = Event::create(['name' => 'Assembly', 'description' => 'x', 'location' => 'Hall', 'event_start' => now()->subHours(3), 'event_end' => now()->subHour()]);
        EventAttendance::create(['event_id' => $e->id, 'user_id' => $resident->id, 'time_in' => now()->subHours(4), 'time_out' => now()->subMinutes(30), 'status' => 'Complete']);

        return $e;
    }

    private function missedEvent(): Event
    {
        return Event::create(['name' => 'Clean-up Drive', 'description' => 'x', 'location' => 'Hall', 'event_start' => now()->subDays(3), 'event_end' => now()->subDays(2)]);
    }

    public function test_a_rating_reaches_staff_with_the_name_the_score_and_the_comment(): void
    {
        $staff = $this->staff();
        $maria = $this->resident();
        $e = $this->attendedEvent($maria);

        $this->actingAs($maria)->postJson('/feedback', ['event_id' => $e->id, 'rating' => 4, 'comment' => 'Well organised'])->assertStatus(201);

        $row = $this->actingAs($staff)->getJson('/staff/alerts')->assertOk()->json('data.0');
        $this->assertSame('Maria Santos sent feedback', $row['title']);
        $this->assertSame(4, $row['rating']);
        $this->assertSame('Well organised', $row['comment']);
        $this->assertSame('rating', $row['kind']);
        $this->assertSame('Assembly', $row['event_name']);
    }

    public function test_an_edited_rating_says_updated_not_sent(): void
    {
        $staff = $this->staff();
        $maria = $this->resident();
        $e = $this->attendedEvent($maria);

        $this->actingAs($maria)->postJson('/feedback', ['event_id' => $e->id, 'rating' => 4])->assertStatus(201);
        $this->actingAs($maria)->postJson('/feedback', ['event_id' => $e->id, 'rating' => 2, 'comment' => 'Changed my mind'])->assertOk();

        $titles = collect($this->actingAs($staff)->getJson('/staff/alerts')->json('data'))->pluck('title')->all();
        $this->assertContains('Maria Santos sent feedback', $titles);
        $this->assertContains('Maria Santos updated their feedback', $titles);
    }

    public function test_a_reason_for_not_attending_lands_in_the_reasons_tab_with_its_label(): void
    {
        $staff = $this->staff();
        $pedro = $this->resident('Pedro', 'Cruz');
        $e = $this->missedEvent();

        $this->actingAs($pedro)->postJson('/feedback/absence', ['event_id' => $e->id, 'reason' => 'sick', 'comment' => 'Fever'])->assertStatus(201);

        $row = $this->actingAs($staff)->getJson('/staff/alerts')->json('data.0');
        $this->assertSame('Pedro Cruz sent a reason for not attending', $row['title']);
        $this->assertSame('absence', $row['kind']);
        $this->assertSame('Sick or unwell', $row['absence_reason'], 'the screens map this label back to the reader\'s language');
        $this->assertSame('Fever', $row['comment']);

        $all = $this->actingAs($staff)->getJson('/staff/alerts/all')->json('counts');
        $this->assertSame(['rating' => 0, 'absence' => 1], $all);
    }

    public function test_a_heart_and_a_reply_reach_the_member_with_the_event_and_the_reply(): void
    {
        $staff = $this->staff();
        $maria = $this->resident();
        $e = $this->attendedEvent($maria);
        $f = $this->actingAs($maria)->postJson('/feedback', ['event_id' => $e->id, 'rating' => 5])->json('feedback.id');

        $this->actingAs($staff)->putJson("/feedback/rating/{$f}/like")->assertOk();
        $this->actingAs($staff)->putJson("/feedback/rating/{$f}/reply", ['reply' => 'Salamat po!'])->assertOk();

        $items = collect($this->actingAs($maria)->getJson('/notifications/replies')->json('new'))->keyBy('kind');
        $this->assertSame('Barangay staff liked your feedback', $items['like']['title']);
        $this->assertSame('feedback', $items['like']['target']);
        $this->assertSame('Barangay staff replied to your feedback', $items['reply']['title']);
        $this->assertSame('Salamat po!', $items['reply']['preview'], 'the inbox shows what staff wrote');
        $this->assertSame('Assembly', $items['reply']['event_name']);
    }

    public function test_a_reply_to_a_reason_is_marked_as_a_response(): void
    {
        $staff = $this->staff();
        $pedro = $this->resident('Pedro', 'Cruz');
        $e = $this->missedEvent();
        $a = $this->actingAs($pedro)->postJson('/feedback/absence', ['event_id' => $e->id, 'reason' => 'work_family'])->json('absence.id');

        $this->actingAs($staff)->putJson("/feedback/absence/{$a}/reply", ['reply' => 'Okay lang po'])->assertOk();

        $reply = collect($this->actingAs($pedro)->getJson('/notifications/replies')->json('new'))->firstWhere('kind', 'reply');
        $this->assertSame('response', $reply['target']);
        $this->assertSame('Okay lang po', $reply['preview']);
    }

    public function test_a_member_liking_the_reply_reaches_the_staff_member_with_the_name(): void
    {
        $staff = $this->staff();
        $maria = $this->resident();
        $e = $this->attendedEvent($maria);
        $f = $this->actingAs($maria)->postJson('/feedback', ['event_id' => $e->id, 'rating' => 5])->json('feedback.id');
        $this->actingAs($staff)->putJson("/feedback/rating/{$f}/reply", ['reply' => 'Salamat po!'])->assertOk();

        $this->actingAs($maria)->putJson("/feedback/rating/{$f}/reply-like")->assertOk();

        $row = collect($this->actingAs($staff)->getJson('/staff/alerts')->json('data'))->firstWhere('reply_like', true);
        $this->assertSame('Maria Santos liked your reply on their feedback', $row['title']);
        $this->assertSame('Salamat po!', $row['comment']);
    }

    public function test_notifications_written_in_the_old_wording_are_rewritten_by_the_migration(): void
    {
        $staff = $this->staff();
        $maria = $this->resident();
        $e = $this->attendedEvent($maria);
        $now = now();
        $base = ['user_id' => $staff->id, 'event_id' => $e->id, 'read' => false, 'created_at' => $now, 'updated_at' => $now];

        Notification::insert([
            $base + ['type' => 'feedback_received', 'title' => 'New feedback received', 'message' => 'Maria Santos rated "Assembly": 4/5 — Good one'],
            $base + ['type' => 'feedback_received', 'title' => "Couldn't attend reported", 'message' => 'Pedro Cruz reported couldn\'t attend "Assembly": no_transport'],
            ['user_id' => $maria->id, 'event_id' => $e->id, 'type' => 'feedback_reply', 'title' => 'Barangay staff replied to your reason', 'message' => 'Okay lang po', 'read' => false, 'created_at' => $now, 'updated_at' => $now],
            ['user_id' => $maria->id, 'event_id' => $e->id, 'type' => 'feedback_reply', 'title' => 'Barangay staff liked your feedback', 'message' => 'Your rating was acknowledged by barangay staff.', 'read' => false, 'created_at' => $now, 'updated_at' => $now],
        ]);

        $migration = require base_path('database/migrations/2026_11_19_000002_restore_feedback_notification_shape.php');
        $migration->up();
        $migration->up(); // safe to run twice

        $rows = DB::table('notifications')->orderBy('id')->get();
        $this->assertSame('Maria Santos sent feedback', $rows[0]->title);
        $this->assertSame("\"Assembly\" - 4/5\nGood one", $rows[0]->message);
        $this->assertSame('Pedro Cruz sent a reason for not attending', $rows[1]->title);
        $this->assertSame('"Assembly" - No transportation', $rows[1]->message);
        $this->assertSame('Barangay staff replied to your response', $rows[2]->title);
        $this->assertSame("\"Assembly\"\nOkay lang po", $rows[2]->message);
        $this->assertSame('"Assembly"', $rows[3]->message);

        $bell = $this->actingAs($staff)->getJson('/staff/alerts')->json('data');
        $this->assertSame('absence', collect($bell)->firstWhere('title', 'Pedro Cruz sent a reason for not attending')['kind']);
    }
}

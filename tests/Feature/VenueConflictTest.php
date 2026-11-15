<?php

namespace Tests\Feature;

use App\Models\Event;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support;
use Tests\TestCase;

/** An event may not be booked into a venue that another event already occupies at that time. */
class VenueConflictTest extends TestCase
{
    use RefreshDatabase, Support;

    /** Times are given as hours from tomorrow 00:00 so the tests never depend on the clock. */
    private function at(float $hour): string
    {
        return now()->addDay()->startOfDay()->addMinutes((int) round($hour * 60))->toDateTimeString();
    }

    private function payload(string $venue, float $call, float $start, float $end, array $extra = []): array
    {
        return array_merge([
            'name' => 'New event', 'description' => 'x', 'location' => $venue,
            'call_time_start' => $this->at($call), 'event_start' => $this->at($start),
            'event_end' => $this->at($end), 'call_time_end' => $this->at($end + 1),
        ], $extra);
    }

    /** An existing event: gathers from 6:00, starts 7:00, ends 9:00 at the Covered Court. */
    private function existing(string $venue = 'Covered Court', ?float $call = 6, float $start = 7, float $end = 9): Event
    {
        return Event::create([
            'name' => 'Basketball League', 'description' => 'x', 'location' => $venue,
            'call_time_start' => $call === null ? null : $this->at($call), 'event_start' => $this->at($start),
            'event_end' => $this->at($end), 'call_time_end' => $this->at($end + 1),
        ]);
    }

    public function test_the_same_venue_at_the_same_start_time_is_refused(): void
    {
        $this->existing();
        $res = $this->actingAs($this->staff())->postJson('/events', $this->payload('Covered Court', 6, 7, 8))->assertStatus(422);

        $this->assertStringContainsString('already booked', $res->json('message'));
        $this->assertSame('Basketball League', $res->json('conflict.name'));
        $this->assertSame(1, Event::count());
    }

    public function test_it_does_not_matter_how_the_venue_name_is_typed(): void
    {
        $this->existing('Covered Court');
        $staff = $this->staff();

        foreach (['covered court', 'COVERED COURT', '  Covered   Court ', 'Covered-Court.', 'coveredcourt'] as $name) {
            $this->actingAs($staff)->postJson('/events', $this->payload($name, 6, 7, 8))->assertStatus(422);
        }
        $this->assertSame(1, Event::count());
    }

    public function test_an_overlap_at_either_end_or_inside_is_refused(): void
    {
        $this->existing(); // occupied 6:00 - 9:00
        $staff = $this->staff();

        $this->actingAs($staff)->postJson('/events', $this->payload('Covered Court', 8, 8.5, 10))->assertStatus(422);   // starts inside
        $this->actingAs($staff)->postJson('/events', $this->payload('Covered Court', 4, 5, 6.5))->assertStatus(422);    // ends inside
        $this->actingAs($staff)->postJson('/events', $this->payload('Covered Court', 5, 5.5, 12))->assertStatus(422);   // wraps around it
        $this->actingAs($staff)->postJson('/events', $this->payload('Covered Court', 6.5, 7, 8))->assertStatus(422);    // sits inside it
    }

    public function test_the_time_people_gather_counts_not_only_the_printed_start(): void
    {
        $this->existing(); // gathers from 6:00 although it starts at 7:00
        // This one ends at 6:30: after the first one's call time, but before its 7:00 start.
        $this->actingAs($this->staff())->postJson('/events', $this->payload('Covered Court', 5, 5.5, 6.5))->assertStatus(422);
    }

    public function test_back_to_back_events_in_one_venue_are_fine(): void
    {
        $this->existing(); // until 9:00
        $this->actingAs($this->staff())->postJson('/events', $this->payload('Covered Court', 9, 9.5, 11))->assertCreated();
        $this->actingAs($this->staff())->postJson('/events', $this->payload('Covered Court', 3, 4, 6))->assertCreated(); // ends as the first one starts gathering
    }

    public function test_a_different_venue_at_the_same_time_is_fine(): void
    {
        $this->existing();
        $this->actingAs($this->staff())->postJson('/events', $this->payload('Barangay Hall', 6, 7, 8))->assertCreated();
    }

    public function test_a_cancelled_event_no_longer_blocks_its_venue(): void
    {
        $e = $this->existing();
        $staff = $this->staff();
        $this->actingAs($staff)->deleteJson("/events/{$e->id}")->assertOk();

        $this->actingAs($staff)->postJson('/events', $this->payload('Covered Court', 6, 7, 8))->assertCreated();
    }

    public function test_an_event_without_a_call_time_is_blocked_from_its_start(): void
    {
        $this->existing('Covered Court', null, 7, 9);
        $staff = $this->staff();

        $this->actingAs($staff)->postJson('/events', $this->payload('Covered Court', 7.2, 7.5, 8))->assertStatus(422);
        $this->actingAs($staff)->postJson('/events', $this->payload('Covered Court', 5, 5.5, 6.5))->assertCreated();
    }

    public function test_editing_an_event_does_not_clash_with_itself_but_does_with_others(): void
    {
        $a = $this->existing('Covered Court', 6, 7, 9);
        $b = $this->existing('Barangay Hall', 6, 7, 9);
        $staff = $this->staff();

        // Same venue and time as its own record: fine.
        $this->actingAs($staff)->putJson("/events/{$a->id}", $this->payload('Covered Court', 6, 7, 9, ['name' => 'Renamed']))->assertOk();
        // Moving it onto the other event's venue and time: refused, and nothing changes.
        $this->actingAs($staff)->putJson("/events/{$a->id}", $this->payload('barangay hall', 6, 7, 9))->assertStatus(422);
        $this->assertSame('Covered Court', $a->fresh()->location);
    }

    public function test_the_live_check_gives_the_same_answer_as_saving(): void
    {
        $this->existing();
        $staff = $this->staff();
        $q = fn (string $venue, float $call, float $start, float $end, array $extra = []) => '/events/venue-check?' . http_build_query(array_merge([
            'location' => $venue, 'call_time_start' => $this->at($call), 'event_start' => $this->at($start), 'event_end' => $this->at($end),
        ], $extra));

        $busy = $this->actingAs($staff)->getJson($q('covered court', 6, 7, 8))->assertOk();
        $this->assertSame('Basketball League', $busy->json('conflict.name'));
        $this->assertNotNull($busy->json('conflict.from'));
        $this->assertNotNull($busy->json('conflict.to'));

        $this->assertNull($this->actingAs($staff)->getJson($q('covered court', 9, 9.5, 11))->json('conflict'));
        $this->assertNull($this->actingAs($staff)->getJson($q('', 6, 7, 8))->json('conflict'));
        $this->assertNull($this->actingAs($staff)->getJson('/events/venue-check?location=Covered+Court')->json('conflict'), 'no times yet: nothing to compare');

        $own = Event::first();
        $this->assertNull($this->actingAs($staff)->getJson($q('Covered Court', 6, 7, 9, ['exclude_id' => $own->id]))->json('conflict'));
    }

    public function test_residents_cannot_use_the_live_check(): void
    {
        $this->actingAs($this->makeUser('Resident'))->getJson('/events/venue-check?location=x')->assertStatus(403);
    }
}

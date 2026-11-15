<?php

namespace Tests\Feature;

use App\Models\AgeBracket;
use App\Models\Event;
use App\Models\EventAttendance;
use App\Models\EventExpense;
use App\Models\InventoryItem;
use App\Models\Membership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Support;
use Tests\TestCase;

/**
 * Number-checking tests for the Reports module. Every test builds a small, known
 * set of records and then checks the exact figures the report returns, so a wrong
 * count, percentage or total cannot slip through.
 *
 * The age brackets used here are NOT the defaults: they are set the way a barangay
 * staff member would set them in Settings, to prove the reports follow them.
 *   Youth 15-30, Adult 31-45, Middle Age 46-59, Senior 60+
 */
class ReportAccuracyTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();

        AgeBracket::withTrashed()->forceDelete();
        foreach ([['Youth', 15, 30], ['Adult', 31, 45], ['Middle Age', 46, 59], ['Senior', 60, null]] as $i => [$label, $min, $max]) {
            AgeBracket::create(['label' => $label, 'min_age' => $min, 'max_age' => $max, 'sort_order' => $i + 1]);
        }
        AgeBracket::forgetCache();
    }

    // ---------- helpers ----------

    private function person(int $age, array $extra = []): User
    {
        return $this->makeUser('Resident', array_merge(['birth_date' => now()->subYears($age)->subDays(3)->toDateString()], $extra));
    }

    private function pastEvent(string $name = 'Past Clean-up', array $extra = []): Event
    {
        return Event::create(array_merge([
            'name' => $name,
            'description' => 'Test event',
            'location' => 'Barangay Hall',
            'event_start' => now()->subDays(10)->setTime(8, 0),
            'event_end' => now()->subDays(10)->setTime(10, 0),
        ], $extra));
    }

    private function upcomingEvent(array $membershipIds, string $name = 'Future Assembly'): Event
    {
        return Event::create([
            'name' => $name,
            'description' => 'Test event',
            'location' => 'Covered Court',
            'event_start' => now()->addDays(5)->setTime(8, 0),
            'event_end' => now()->addDays(5)->setTime(10, 0),
            'membership_ids' => $membershipIds,
        ]);
    }

    private function scan(Event $e, User $u, bool $in, bool $out): void
    {
        EventAttendance::create([
            'event_id' => $e->id,
            'user_id' => $u->id,
            'time_in' => $in ? now()->subDays(10)->setTime(8, 5) : null,
            'time_out' => $out ? now()->subDays(10)->setTime(9, 50) : null,
            'status' => $in || $out ? 'attended' : 'missed',
        ]);
    }

    private function enroll(Membership $m, User ...$users): void
    {
        foreach ($users as $u) {
            $u->memberships()->attach($m->id);
        }
    }

    /**
     * Six people at one past event:
     *   age 20 complete, age 20 incomplete (sign-in only), age 35 absent,
     *   age 50 complete, age 65 absent, age 10 complete (too young for any bracket).
     */
    private function sixAtPastEvent(): Event
    {
        $e = $this->pastEvent();
        $this->scan($e, $this->person(20), true, true);
        $this->scan($e, $this->person(20), true, false);
        $this->scan($e, $this->person(35), false, false);
        $this->scan($e, $this->person(50), true, true);
        $this->scan($e, $this->person(65), false, false);
        $this->scan($e, $this->person(10), true, true);

        return $e;
    }

    private function attendance(array $query = []): array
    {
        $res = $this->actingAs($this->staff())->getJson('/reports/attendance-summary?' . http_build_query($query));
        $res->assertOk();

        return $res->json();
    }

    // ---------- attendance numbers ----------

    public function test_attendance_totals_percentage_and_labels_are_exact(): void
    {
        $this->sixAtPastEvent();

        $d = $this->attendance(['include_attendees' => 1]);

        $this->assertSame(1, $d['summary']['total_events']);
        $this->assertSame(6, $d['summary']['total_eligible']);
        $this->assertSame(4, $d['summary']['total_attended']);   // complete + incomplete
        $this->assertEquals(66.7, $d['summary']['attendance_percentage']);

        $ev = $d['per_event'][0];
        $this->assertSame(6, $ev['eligible']);
        $this->assertSame(4, $ev['attended']);
        $this->assertSame(2, $ev['absent']);
        $this->assertSame('Past', $ev['status']);

        $labels = collect($ev['attendees'])->countBy('attendance')->all();
        $this->assertSame(['Complete' => 3, 'Incomplete' => 1, 'Absent' => 2], $labels);
    }

    public function test_attendee_list_can_be_limited_to_present_or_absent(): void
    {
        $this->sixAtPastEvent();

        $present = $this->attendance(['include_attendees' => 1, 'attendee_filter' => 'present']);
        $absent = $this->attendance(['include_attendees' => 1, 'attendee_filter' => 'absent']);

        $this->assertCount(4, $present['per_event'][0]['attendees']);
        $this->assertCount(2, $absent['per_event'][0]['attendees']);
        // The totals do not change when only the list is limited.
        $this->assertSame(6, $present['summary']['total_eligible']);
    }

    public function test_upcoming_event_people_are_expected_not_absent(): void
    {
        $m = Membership::create(['name' => 'Farmers', 'description' => 'x']);
        $this->enroll($m, $this->person(25), $this->person(40));
        $this->upcomingEvent([$m->id]);

        $d = $this->attendance(['include_attendees' => 1]);

        $this->assertSame('Upcoming', $d['per_event'][0]['status']);
        $this->assertSame(2, $d['summary']['total_eligible']);
        $this->assertSame(0, $d['summary']['total_attended']);
        $this->assertSame(['Expected', 'Expected'], collect($d['per_event'][0]['attendees'])->pluck('attendance')->all());
    }

    public function test_empty_database_gives_zeroes_not_errors(): void
    {
        $d = $this->attendance();

        $this->assertSame(0, $d['summary']['total_events']);
        $this->assertSame(0, $d['summary']['total_eligible']);
        $this->assertEquals(0, $d['summary']['attendance_percentage']);
    }

    public function test_date_range_leaves_out_events_outside_it(): void
    {
        $this->sixAtPastEvent();                                              // 10 days ago
        $old = $this->pastEvent('Old Event', ['event_start' => now()->subDays(100), 'event_end' => now()->subDays(100)->addHours(2)]);
        $this->scan($old, $this->person(30), true, true);

        $d = $this->attendance(['date_from' => now()->subDays(20)->toDateString(), 'date_to' => now()->toDateString()]);

        $this->assertSame(1, $d['summary']['total_events']);
        $this->assertSame(6, $d['summary']['total_eligible']);
    }

    // ---------- age filter follows the staff-set brackets ----------

    public function test_age_filter_uses_the_brackets_staff_set_and_limits_the_eligible_count(): void
    {
        $this->sixAtPastEvent();

        $youth = $this->attendance(['age_group' => 'Youth']);
        $this->assertSame(2, $youth['summary']['total_eligible']);
        $this->assertSame(2, $youth['summary']['total_attended']);
        $this->assertEquals(100.0, $youth['summary']['attendance_percentage']);

        $adult = $this->attendance(['age_group' => 'Adult']);
        $this->assertSame(1, $adult['summary']['total_eligible']);
        $this->assertSame(0, $adult['summary']['total_attended']);
        $this->assertEquals(0, $adult['summary']['attendance_percentage']);

        $senior = $this->attendance(['age_group' => 'Senior']);
        $this->assertSame(1, $senior['summary']['total_eligible']);

        // A 20-year-old counts as Youth (15-30) here, not "Adult" as the old fixed bands said.
        $middle = $this->attendance(['age_group' => 'Middle Age']);
        $this->assertSame(1, $middle['summary']['total_eligible']);
        $this->assertSame(1, $middle['summary']['total_attended']);
    }

    public function test_age_filter_ignores_letter_case_and_unknown_names_match_nobody(): void
    {
        $this->sixAtPastEvent();

        $this->assertSame(2, $this->attendance(['age_group' => 'youth'])['summary']['total_eligible']);
        $this->assertSame(2, $this->attendance(['age_group' => 'YOUTH'])['summary']['total_eligible']);
        $this->assertSame(0, $this->attendance(['age_group' => 'Teenagers'])['summary']['total_eligible']);
    }

    public function test_age_breakdown_counts_who_attended_in_each_bracket_and_shows_the_rest(): void
    {
        $this->sixAtPastEvent();
        $this->scan($this->pastEvent('Second'), $this->makeUser('Resident'), true, true);   // attended, no birth date

        $rows = collect($this->attendance()['age_breakdown'])->keyBy('group');

        $this->assertSame(2, $rows['Youth']['attended']);         // the two 20-year-olds (one incomplete still counts)
        $this->assertSame(0, $rows['Adult']['attended']);         // age 35 was absent
        $this->assertSame(1, $rows['Middle Age']['attended']);    // age 50
        $this->assertSame(0, $rows['Senior']['attended']);        // age 65 was absent
        $this->assertSame(1, $rows['Outside the age groups']['attended']);   // age 10
        $this->assertSame(1, $rows['No birth date']['attended']);
        $this->assertSame('Youth (15-30)', $rows['Youth']['label']);
        $this->assertSame('Senior (60+)', $rows['Senior']['label']);
        $this->assertTrue($rows['Youth']['filterable']);
        $this->assertFalse($rows['No birth date']['filterable']);

        // The bars add up to everyone who attended: 4 in the first event + 1 in the second.
        $this->assertSame(5, $rows->sum('attended'));
    }

    public function test_age_breakdown_has_only_the_real_brackets_when_everyone_fits(): void
    {
        $e = $this->pastEvent();
        $this->scan($e, $this->person(40), true, true);

        $groups = collect($this->attendance()['age_breakdown'])->pluck('group')->all();

        $this->assertSame(['Youth', 'Adult', 'Middle Age', 'Senior'], $groups);
    }

    public function test_age_filter_is_limited_to_one_membership_too(): void
    {
        $m = Membership::create(['name' => 'Seniors Club', 'description' => 'x']);
        $a = $this->person(65);
        $b = $this->person(70);
        $c = $this->person(25);
        $this->enroll($m, $a, $b, $c);
        $e = $this->pastEvent('Seniors Day', ['membership_ids' => [$m->id]]);
        $this->scan($e, $a, true, true);
        $this->scan($e, $b, false, false);
        $this->scan($e, $c, true, true);

        $d = $this->attendance(['membership_id' => $m->id, 'age_group' => 'Senior']);

        $this->assertSame(2, $d['summary']['total_eligible']);
        $this->assertSame(1, $d['summary']['total_attended']);
        $this->assertEquals(50.0, $d['summary']['attendance_percentage']);
    }

    public function test_residents_list_and_report_agree_on_who_is_in_an_age_group(): void
    {
        $this->sixAtPastEvent();
        $staff = $this->staff();

        foreach (['Youth' => 2, 'Adult' => 1, 'Middle Age' => 1, 'Senior' => 1] as $label => $expected) {
            $report = $this->actingAs($staff)->getJson('/reports/attendance-summary?age_group=' . urlencode($label))->json();
            $this->assertSame($expected, $report['summary']['total_eligible'], "report, $label");

            $count = User::where('role', 'Resident')
                ->where(fn ($q) => AgeBracket::applyToUserQuery($q, $label))
                ->count();
            $this->assertSame($expected, $count, "resident list, $label");
        }
    }

    public function test_without_any_brackets_the_old_four_bands_still_work(): void
    {
        AgeBracket::withTrashed()->forceDelete();
        AgeBracket::forgetCache();

        $e = $this->pastEvent();
        $this->scan($e, $this->person(8), true, true);    // Child
        $this->scan($e, $this->person(15), true, true);   // Youth
        $this->scan($e, $this->person(30), false, false); // Adult
        $this->scan($e, $this->person(70), true, true);   // Senior Citizen

        $this->assertSame(1, $this->attendance(['age_group' => 'youth'])['summary']['total_eligible']);
        $this->assertSame(1, $this->attendance(['age_group' => 'Child'])['summary']['total_eligible']);
        $this->assertSame(1, $this->attendance(['age_group' => 'Adult'])['summary']['total_eligible']);
        $this->assertSame(1, $this->attendance(['age_group' => 'Senior Citizen'])['summary']['total_eligible']);
    }

    // ---------- reading a report never writes ----------

    public function test_running_a_report_does_not_create_attendance_rows(): void
    {
        $m = Membership::create(['name' => 'Farmers', 'description' => 'x']);
        $this->enroll($m, $this->person(25), $this->person(40), $this->person(55));
        $this->upcomingEvent([$m->id]);

        $this->assertSame(0, EventAttendance::count());

        $first = $this->attendance(['include_attendees' => 1]);
        $second = $this->attendance(['include_attendees' => 1]);
        $filtered = $this->attendance(['age_group' => 'Youth']);

        $this->assertSame(0, EventAttendance::count(), 'viewing a report must not insert rows');
        $this->assertSame($first['summary'], $second['summary']);
        $this->assertSame(3, $first['summary']['total_eligible']);
        $this->assertSame(1, $filtered['summary']['total_eligible']);
    }

    public function test_exports_do_not_create_attendance_rows_either(): void
    {
        $m = Membership::create(['name' => 'Farmers', 'description' => 'x']);
        $this->enroll($m, $this->person(25), $this->person(40));
        $this->upcomingEvent([$m->id]);
        $staff = $this->staff();

        foreach (['html', 'csv', 'word', 'pdf'] as $format) {
            $this->actingAs($staff)->get("/reports/export/$format?type=attendance")->assertOk();
        }

        $this->assertSame(0, EventAttendance::count());
    }

    public function test_a_resident_registered_after_the_event_was_posted_is_counted_as_expected(): void
    {
        $m = Membership::create(['name' => 'Farmers', 'description' => 'x']);
        $this->enroll($m, $this->person(25), $this->person(40));
        $this->upcomingEvent([$m->id]);

        $this->assertSame(2, $this->attendance()['summary']['total_eligible']);

        $this->enroll($m, $this->person(33));

        $this->assertSame(3, $this->attendance()['summary']['total_eligible']);
        $this->assertSame(0, EventAttendance::count());
    }

    public function test_a_past_event_does_not_grow_when_new_residents_register_later(): void
    {
        $m = Membership::create(['name' => 'Farmers', 'description' => 'x']);
        $a = $this->person(25);
        $this->enroll($m, $a);
        $e = $this->pastEvent('Done', ['membership_ids' => [$m->id]]);
        $this->scan($e, $a, true, true);

        $this->enroll($m, $this->person(26));   // joins after the event ended

        $d = $this->attendance();
        $this->assertSame(1, $d['summary']['total_eligible']);
        $this->assertEquals(100.0, $d['summary']['attendance_percentage']);
    }

    // ---------- printed / exported wording ----------

    public function test_printed_report_states_the_age_group_and_membership_it_is_limited_to(): void
    {
        $this->sixAtPastEvent();
        $m = Membership::create(['name' => 'Seniors Club', 'description' => 'x']);

        $html = $this->actingAs($this->staff())
            ->get('/reports/export/html?type=attendance&age_group=Youth&membership_id=' . $m->id)
            ->assertOk()->getContent();

        $this->assertStringContainsString('Age group: Youth', $html);
        $this->assertStringContainsString('Membership: Seniors Club', $html);
        $this->assertStringContainsString('Attendees grouped by the barangay', $html);
    }

    public function test_csv_has_exact_figures_and_blocks_spreadsheet_formulas(): void
    {
        $e = $this->pastEvent('=HYPERLINK("http://evil.test")');
        $this->scan($e, $this->person(20), true, true);
        $this->scan($e, $this->person(21), false, false);

        $staff = $this->staff();
        $json = $this->actingAs($staff)->getJson('/reports/export/csv?type=attendance&as=json')->assertOk()->json();

        $row = $json['rows'][0];
        $columns = collect($json['columns'])->pluck('label')->all();
        $get = fn (string $c) => $row[array_search($c, $columns, true)];
        $this->assertSame(2, $get('Registered'));
        $this->assertSame(1, $get('Present'));
        $this->assertSame(1, $get('Absent'));
        $this->assertEquals(50.0, $get('Attendance %'));

        $csv = $this->actingAs($staff)->get('/reports/export/csv?type=attendance')->assertOk()->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString("'=HYPERLINK", $csv);
        $this->assertStringNotContainsString(',=HYPERLINK', $csv);
    }

    // ---------- budget ----------

    public function test_budget_totals_remaining_and_over_budget_are_exact(): void
    {
        $a = $this->pastEvent('Fiesta', ['approved_budget' => 10000]);
        $b = $this->pastEvent('Sports Fest', ['approved_budget' => 5000]);
        $c = $this->pastEvent('Free Seminar');    // no budget set

        EventExpense::create(['event_id' => $a->id, 'item' => 'Food', 'amount' => 4000.50]);
        EventExpense::create(['event_id' => $a->id, 'item' => 'Sound system', 'amount' => 2500.25]);
        EventExpense::create(['event_id' => $b->id, 'item' => 'Trophies', 'amount' => 6000]);
        EventExpense::create(['event_id' => $c->id, 'item' => 'Snacks', 'amount' => 300]);

        $d = $this->actingAs($this->staff())->getJson('/reports/budget-summary')->assertOk()->json();
        $s = $d['summary'];

        $this->assertSame(2, $s['total_events']);                    // events WITH a budget
        $this->assertEquals(15000.00, $s['total_approved_budget']);
        $this->assertEquals(12500.75, $s['total_expenses']);         // 4000.50 + 2500.25 + 6000
        $this->assertEquals(2499.25, $s['total_remaining']);         // 3499.25 left on Fiesta, 1000 over on Sports Fest

        $rows = collect($d['per_event'])->keyBy('name');
        $this->assertEquals(6500.75, $rows['Fiesta']['total_expenses']);
        $this->assertEquals(3499.25, $rows['Fiesta']['remaining']);
        $this->assertEquals(65.0, round($rows['Fiesta']['utilization']));
        $this->assertSame('Within budget', $rows['Fiesta']['budget_status']);
        $this->assertTrue($rows['Sports Fest']['is_over_budget']);
        $this->assertEquals(1000.0, $rows['Sports Fest']['over_by']);
        $this->assertSame('Over budget', $rows['Sports Fest']['budget_status']);

        // The event with no budget is listed separately and NOT mixed into the totals.
        $this->assertSame('Free Seminar', $d['unbudgeted'][0]['name']);
        $this->assertEquals(300.0, $d['unbudgeted'][0]['total_expenses']);
    }

    public function test_budget_report_with_no_events_is_all_zero(): void
    {
        $s = $this->actingAs($this->staff())->getJson('/reports/budget-summary')->assertOk()->json('summary');

        $this->assertSame(0, $s['total_events']);
        $this->assertEquals(0, $s['total_approved_budget']);
        $this->assertEquals(0, $s['total_expenses']);
    }

    // ---------- membership ----------

    public function test_membership_report_counts_members_and_lists_the_age_brackets(): void
    {
        $m = Membership::create(['name' => 'Youth Council', 'description' => 'x']);
        $m->eligibleAgeBrackets()->sync([AgeBracket::where('label', 'Youth')->value('id')]);
        $this->enroll($m, $this->person(20), $this->person(22), $this->person(28));
        $empty = Membership::create(['name' => 'Zumba Group', 'description' => 'x']);

        $d = $this->actingAs($this->staff())->getJson('/reports/membership-summary')->assertOk()->json();

        $this->assertSame(2, $d['summary']['total_memberships']);
        $this->assertSame(3, $d['summary']['total_assignments']);
        $rows = collect($d['per_membership'])->keyBy('name');
        $this->assertSame(3, $rows['Youth Council']['member_count']);
        $this->assertSame('Youth', $rows['Youth Council']['eligible_age_bracket']);
        $this->assertSame(0, $rows['Zumba Group']['member_count']);
        $this->assertNull($rows['Zumba Group']['eligible_age_bracket']);   // none picked = any age
    }

    // ---------- inventory ----------

    public function test_inventory_totals_are_exact(): void
    {
        InventoryItem::create(['name' => 'Tables', 'quantity' => 10, 'new_quantity' => 4, 'good_quantity' => 6, 'fair_quantity' => 0, 'poor_quantity' => 0, 'lost_quantity' => 1]);
        InventoryItem::create(['name' => 'Chairs', 'quantity' => 50, 'new_quantity' => 0, 'good_quantity' => 30, 'fair_quantity' => 15, 'poor_quantity' => 5, 'lost_quantity' => 2]);

        $d = $this->actingAs($this->staff())->getJson('/reports/inventory-summary')->assertOk()->json();

        $this->assertSame(2, $d['summary']['total_items']);
        $this->assertEquals(60, $d['summary']['total_quantity']);
        $this->assertSame(3, $d['summary']['lost_units']);

        $by = collect($d['by_condition'])->keyBy('condition');
        $this->assertSame(4, $by['New']['quantity']);
        $this->assertSame(36, $by['Good']['quantity']);   // 6 + 30
        $this->assertSame(15, $by['Fair']['quantity']);
        $this->assertSame(5, $by['Poor']['quantity']);
    }

    public function test_every_report_type_returns_ok_when_there_is_no_data(): void
    {
        $staff = $this->staff();

        foreach (['attendance', 'membership', 'budget', 'inventory'] as $type) {
            $this->actingAs($staff)->getJson("/reports/{$type}-summary")->assertOk();
            $this->actingAs($staff)->get("/reports/export/html?type=$type")->assertOk();
        }
    }

    // ---------- who may read reports ----------

    public function test_a_resident_cannot_read_reports(): void
    {
        $this->actingAs($this->person(30))->getJson('/reports/attendance-summary')->assertStatus(403);
    }
}

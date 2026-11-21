<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\InventoryItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use ReflectionObject;
use Tests\Support;
use Tests\TestCase;

/**
 * Every rule the database enforces must also be enforced by the API, so a person who breaks it gets a
 * clear 422 message in their own language instead of a server error from the database (which is the
 * last line of defence, not the first).
 *
 * The list of database rules is read from the migrations themselves. Each rule must be either probed
 * here through the API, or be listed as a value the server writes itself (never taken from a request).
 * A new database rule that is in neither list fails the completeness test below, so the two layers
 * cannot drift apart.
 */
class ApiMirrorsDatabaseRulesTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
    }

    /** Rules a caller can break through an endpoint -> the test that probes it. */
    private const PROBED = [
        'feedback.rating_range' => 'test_ratings_and_feedback_windows',
        'feedback.windows_not_negative' => 'test_ratings_and_feedback_windows',
        'feedback.submit_window_range' => 'test_ratings_and_feedback_windows',
        'feedback.edit_window_range' => 'test_ratings_and_feedback_windows',
        'event_expenses.amount_range' => 'test_money_amounts',
        'events.budget_range' => 'test_money_amounts',
        'events.end_after_start' => 'test_event_times_and_text',
        'events.call_start_before_start' => 'test_event_times_and_text',
        'events.call_end_not_before_end' => 'test_event_times_and_text',
        'events.call_window_order' => 'test_event_times_and_text',
        'events.name_not_blank' => 'test_event_times_and_text',
        'events.location_not_blank' => 'test_event_times_and_text',
        'events.start_not_too_old' => 'test_event_times_and_text',
        'events.flags_0_or_1' => 'test_yes_no_flags',
        'users.flags_0_or_1' => 'test_yes_no_flags',
        'inventory_items.quantities_not_negative' => 'test_quantities',
        'event_inventory_items.quantities_not_negative' => 'test_quantities',
        'event_inventory_releases.quantities_not_negative' => 'test_quantities',
        'event_inventory_release_undos.quantity_not_negative' => 'test_quantities',
        'inventory_unit_logs.quantity_not_negative' => 'test_quantities',
        'inventory_items.name_not_blank' => 'test_quantities',
        'users.role_values' => 'test_resident_words_and_dates',
        'users.gender_values' => 'test_resident_words_and_dates',
        'users.language_values' => 'test_resident_words_and_dates',
        'users.position_values' => 'test_resident_words_and_dates',
        'users.first_name_not_blank' => 'test_resident_words_and_dates',
        'users.last_name_not_blank' => 'test_resident_words_and_dates',
        'users.birth_date_not_too_old' => 'test_resident_words_and_dates',
        'generated_reports.type_values' => 'test_report_type_and_history_kind',
        'feedback_edits.kind_values' => 'test_report_type_and_history_kind',
        'current_statuses.category_values' => 'test_lookup_lists',
        'age_brackets.min_age_range' => 'test_lookup_lists',
        'age_brackets.max_age_range' => 'test_lookup_lists',
        'age_brackets.sort_order_not_negative' => 'test_lookup_lists',
        'civil_statuses.sort_order_not_negative' => 'test_lookup_lists',
        'current_statuses.sort_order_not_negative' => 'test_lookup_lists',
        'users.code_format' => 'test_codes_cannot_be_chosen_by_the_caller',
        'households.code_format' => 'test_codes_cannot_be_chosen_by_the_caller',
    ];

    /** Rules on values only the server writes; the caller has no field for them. */
    private const SERVER_SET = [
        'attendances.time_order' => 'time_in and time_out come from the scan, judged against the event windows (OfflineScanSyncTest)',
        'attendances.status_values' => 'status is worked out from the scans',
        'users.login_attempts_not_negative' => 'counted by the login code',
        'sms_logs.status_values' => 'written by the SMS service',
        'sms_logs.to_number_format' => 'taken from stored, already validated contact numbers',
        'inventory_unit_logs.action_values' => 'written by the stock screens; the edit route accepts only "found"',
        'notifications.flags_0_or_1' => 'written by the notification code',
        'security_alerts.flags_0_or_1' => 'written by the security code',
        'integration_settings.flags_0_or_1' => 'written by the integration code',
        'memberships.flags_0_or_1' => 'is_active is changed by the activate/deactivate action only',
        'head_staff_transfers.status_values' => 'written by the transfer code',
        'feedback_edits.rating_range' => 'copied from a rating that was already validated',
        'name_suffixes.sort_order_not_negative' => 'the suffix form has no sort field',
    ];

    // ------------------------------------------------------------------ completeness

    public function test_every_database_rule_is_probed_here_or_is_a_value_only_the_server_writes(): void
    {
        $keys = [];
        foreach (['000006_lock_business_rules_in_database', '000008_lock_text_dates_flags_and_sms_number', '000015_lock_status_words_and_number_ranges'] as $f) {
            $m = require database_path("migrations/2026_11_19_{$f}.php");
            $method = (new ReflectionObject($m))->getMethod('rules');
            $method->setAccessible(true);
            foreach ($method->invoke($m) as $rule) {
                $keys[] = $rule[0] . '.' . $rule[1];
            }
        }
        $this->assertNotEmpty($keys);

        $known = array_merge(array_keys(self::PROBED), array_keys(self::SERVER_SET));
        $archive = array_filter($keys, fn ($k) => str_ends_with($k, '.deleted_by_not_blank'));   // set by the archive code from the signed-in user
        $missing = array_diff($keys, $known, $archive);
        $this->assertSame([], array_values($missing), 'These database rules have no API probe: ' . implode(', ', $missing));

        // and every probe named above really exists
        foreach (array_unique(self::PROBED) as $name) {
            $this->assertTrue(method_exists($this, $name), $name);
        }
        // nothing in the lists is stale
        $this->assertSame([], array_values(array_diff($known, $keys)), 'A listed rule no longer exists in the migrations');
    }

    // ------------------------------------------------------------------ helpers

    private function refused($response, ?string $field = null): void
    {
        $this->assertSame(422, $response->status(), 'expected a clear 422 refusal, got ' . $response->status() . ' ' . substr($response->getContent(), 0, 200));
        $response->assertJsonStructure(['message']);
        if ($field) {
            $response->assertJsonValidationErrors($field);
        }
    }

    private function event(array $extra = []): array
    {
        return array_merge([
            'name' => 'Clean-up', 'description' => 'Drive', 'location' => 'Plaza',
            'event_start' => now()->addHours(4)->toDateTimeString(), 'event_end' => now()->addHours(6)->toDateTimeString(),
            'call_time_start' => now()->addHour()->toDateTimeString(), 'call_time_end' => now()->addHours(7)->toDateTimeString(),
        ], $extra);
    }

    private function resident(array $o = []): array
    {
        return array_merge([
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'contact_number' => '09171234567',
            'role' => 'Resident', 'has_account' => true,
            'password' => 'Passw0rd!Strong#1', 'password_confirmation' => 'Passw0rd!Strong#1',
        ], $o);
    }

    // ------------------------------------------------------------------ probes

    public function test_ratings_and_feedback_windows(): void
    {
        $head = $this->headStaff();
        $member = $this->makeUser('Resident');
        $e = Event::create(['name' => 'Past', 'description' => 'x', 'location' => 'Hall', 'event_start' => now()->subDays(2), 'event_end' => now()->subDays(2)->addHours(2)]);

        foreach ([0, 6, -1, 'five'] as $bad) {
            $this->refused($this->actingAs($member)->postJson('/feedback', ['event_id' => $e->id, 'rating' => $bad]), 'rating');
        }
        foreach ([[0, 30], [169, 30], [24, 0], [24, 121], [-5, 30], [24, -5]] as [$h, $m]) {
            $this->refused($this->actingAs($head)->putJson('/settings/feedback-rules', ['close_after_hours' => $h, 'edit_window_minutes' => $m, 'password' => 'Passw0rd!Strong#1']));
        }
        $this->assertSame(0, DB::table('feedback')->count());
    }

    public function test_money_amounts(): void
    {
        $s = $this->staff();
        $ev = Event::create($this->event());
        foreach ([0, '0.00', -5, '100000000', '12.345', 'abc'] as $bad) {
            $this->refused($this->actingAs($s)->post("/events/{$ev->id}/expenses", ['item' => 'x', 'amount' => $bad, 'receipt' => $this->fakeImage('r.jpg')], ['Accept' => 'application/json']), 'amount');
        }
        foreach ([-1, '100000000', 'abc'] as $bad) {
            $this->refused($this->actingAs($s)->putJson("/events/{$ev->id}/budget", ['approved_budget' => $bad]), 'approved_budget');
            $this->refused($this->actingAs($s)->postJson('/events', $this->event(['approved_budget' => $bad])), 'approved_budget');
        }
        $this->assertSame(0, DB::table('event_expenses')->count());
    }

    public function test_event_times_and_text(): void
    {
        $s = $this->staff();
        $cases = [
            'event_end'       => ['event_end' => now()->addHours(3)->toDateTimeString()],               // ends before it starts
            'call_time_start' => ['call_time_start' => now()->addHours(5)->toDateTimeString()],         // opens after the start
            'call_time_end'   => ['call_time_end' => now()->addHours(5)->toDateTimeString()],           // closes before the event ends
            'name'            => ['name' => '   '],
            'location'        => ['location' => str_repeat('x', 101)],
            'event_start'     => ['event_start' => '2019-12-31 08:00:00', 'event_end' => '2019-12-31 10:00:00'],
            'far'             => ['event_start' => now()->addYears(4)->toDateTimeString(), 'event_end' => now()->addYears(4)->addHours(2)->toDateTimeString()],
        ];
        foreach ($cases as $field => $override) {
            $r = $this->actingAs($s)->postJson('/events', $this->event($override));
            $this->refused($r);
        }
        // call end not after call start
        $this->refused($this->actingAs($s)->postJson('/events', $this->event(['call_time_start' => now()->addHours(3)->toDateTimeString(), 'call_time_end' => now()->addHours(3)->toDateTimeString()])));
        $this->assertSame(0, Event::count());

        // the same rules hold when an existing event is edited
        $ok = $this->actingAs($s)->postJson('/events', $this->event())->assertSuccessful();
        $id = Event::first()->id;
        $this->refused($this->actingAs($s)->putJson("/events/{$id}", $this->event(['event_end' => now()->addHours(3)->toDateTimeString()])));
        $this->refused($this->actingAs($s)->putJson("/events/{$id}", $this->event(['name' => "\t \n"])));
        $this->refused($this->actingAs($s)->putJson("/events/{$id}", $this->event(['event_start' => '2019-01-01 08:00:00', 'event_end' => '2019-01-01 10:00:00'])));
    }

    public function test_yes_no_flags(): void
    {
        $s = $this->staff();
        $this->refused($this->actingAs($s)->postJson('/events', $this->event(['post_to_facebook' => 'maybe'])), 'post_to_facebook');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['has_account' => 'perhaps'])), 'has_account');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['is_household_head' => 'sure'])), 'is_household_head');
        $this->assertSame(0, Event::count());
    }

    public function test_quantities(): void
    {
        $s = $this->staff();
        foreach (['quantity', 'new_quantity', 'good_quantity', 'fair_quantity', 'poor_quantity'] as $f) {
            $this->refused($this->actingAs($s)->postJson('/inventory', ['name' => 'Chairs', 'quantity' => 5, $f => -1]), $f);
        }
        $this->refused($this->actingAs($s)->postJson('/inventory', ['name' => '   ', 'quantity' => 5]), 'name');
        $this->refused($this->actingAs($s)->postJson('/inventory', ['name' => 'Chairs', 'quantity' => '99999999999']));   // larger than the column holds
        $this->assertSame(0, InventoryItem::count());

        $item = InventoryItem::create(['name' => 'Tents', 'quantity' => 4, 'new_quantity' => 0, 'good_quantity' => 4, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $this->refused($this->actingAs($s)->putJson("/inventory/{$item->id}", ['quantity' => -2]));
        $this->refused($this->actingAs($s)->putJson("/inventory/{$item->id}", ['name' => '  ']));
        $this->refused($this->actingAs($s)->putJson("/inventory/{$item->id}", ['quantity' => '99999999999']));
        $this->refused($this->actingAs($s)->postJson("/inventory/{$item->id}/units", ['units' => ['good' => -1]]));
        $this->refused($this->actingAs($s)->postJson("/inventory/{$item->id}/units", ['units' => ['good' => '99999999999']]));
        $this->refused($this->actingAs($s)->postJson('/events', $this->event(['borrowed_items' => [['inventory_item_id' => $item->id, 'quantity' => -1]]])));
        $this->refused($this->actingAs($s)->postJson('/events', $this->event(['borrowed_items' => [['inventory_item_id' => $item->id, 'quantity' => 2, 'conditions' => ['good' => -2]]]])));
        $this->assertSame(4, (int) $item->fresh()->quantity);
    }

    public function test_resident_words_and_dates(): void
    {
        $s = $this->staff();
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['role' => 'Admin'])), 'role');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['gender' => 'Other'])), 'gender');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['preferred_language' => 'fr'])), 'preferred_language');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['barangay_position' => 'treasurer'])), 'barangay_position');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['first_name' => '   '])), 'first_name');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['last_name' => ''])), 'last_name');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['birth_date' => '1899-12-31'])), 'birth_date');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['birth_date' => now()->addDay()->toDateString()])), 'birth_date');
        $this->refused($this->actingAs($s)->postJson('/users', $this->resident(['contact_number' => '0812'])), 'contact_number');
        $this->assertSame(1, User::count());   // only the staff account made by this test

        $r = $this->makeUser('Resident');
        $this->refused($this->actingAs($s)->putJson("/users/{$r->id}", ['first_name' => '   ']), 'first_name');
        $this->refused($this->actingAs($s)->putJson("/users/{$r->id}", ['role' => 'Admin']), 'role');
        $this->refused($this->actingAs($s)->putJson("/users/{$r->id}", ['birth_date' => '1800-01-01']), 'birth_date');
        $this->refused($this->actingAs($s)->putJson("/users/{$r->id}", ['gender' => 'x']), 'gender');
    }

    public function test_report_type_and_history_kind(): void
    {
        $s = $this->staff();
        $this->refused($this->actingAs($s)->postJson('/reports/history', ['type' => 'secrets']), 'type');
        $this->assertSame(0, DB::table('generated_reports')->count());

        // an unknown kind in the address is a clean "not found", never a database error
        foreach (['bogus', 'Feedback ', '1'] as $kind) {
            $status = $this->actingAs($s)->putJson("/feedback/{$kind}/1/like")->status();
            $this->assertContains($status, [404, 405, 422], "kind {$kind} gave {$status}");
        }
    }

    public function test_lookup_lists(): void
    {
        $s = $this->staff();
        // ages (start from an empty list: the migrations seed brackets that would overlap the test ones)
        DB::table('age_brackets')->delete();
        foreach ([['min_age' => -1], ['min_age' => 121], ['min_age' => 10, 'max_age' => 121], ['min_age' => 10, 'max_age' => 9], ['min_age' => 'x'], ['min_age' => 10, 'sort_order' => -1]] as $bad) {
            $this->refused($this->actingAs($s)->postJson('/age-brackets', ['label' => 'Group'] + $bad));
        }
        $this->actingAs($s)->postJson('/age-brackets', ['label' => 'Edge', 'min_age' => 0, 'max_age' => 120])->assertStatus(201);
        $id = DB::table('age_brackets')->where('label', 'Edge')->value('id');
        foreach ([['min_age' => 121], ['min_age' => 5, 'max_age' => 121], ['min_age' => 30, 'max_age' => 20], ['min_age' => 5, 'sort_order' => -3]] as $bad) {
            $this->refused($this->actingAs($s)->putJson("/age-brackets/{$id}", ['label' => 'Edge'] + $bad));
        }
        // statuses
        $this->refused($this->actingAs($s)->postJson('/current-statuses', ['label' => 'Odd', 'category' => 'bogus']), 'category');
        $this->refused($this->actingAs($s)->postJson('/current-statuses', ['label' => 'Odd', 'sort_order' => -1]), 'sort_order');
        $this->refused($this->actingAs($s)->postJson('/civil-statuses', ['label' => 'Odd', 'sort_order' => -1]), 'sort_order');
        foreach (['/current-statuses', '/civil-statuses', '/age-brackets'] as $path) {
            $this->refused($this->actingAs($s)->postJson($path, ['label' => '   ', 'min_age' => 5]), 'label');
        }
        $this->refused($this->actingAs($s)->postJson('/name-suffixes', ['name' => '   ']), 'name');
        $this->refused($this->actingAs($s)->postJson('/name-suffixes', ['name' => str_repeat('x', 11)]), 'name');
        // a sort order too large for the column is refused too, not a database error
        $this->refused($this->actingAs($s)->postJson('/civil-statuses', ['label' => 'Huge', 'sort_order' => 99999999999]), 'sort_order');
    }

    public function test_codes_cannot_be_chosen_by_the_caller(): void
    {
        $s = $this->staff();
        $this->actingAs($s)->postJson('/users', $this->resident(['user_code' => 'bad code!', 'household_code' => 'x y']))->assertStatus(201);
        $this->assertMatchesRegularExpression('/^PR-\d{4,}$/', User::where('first_name', 'Juan')->value('user_code'));

        $head = User::where('first_name', 'Juan')->first();
        $this->actingAs($s)->postJson('/households', ['address' => 'Purok 1', 'head_user_id' => $head->id, 'code' => 'nope!'])->assertStatus(201);
        $this->assertMatchesRegularExpression('/^HH-\d{4,}$/', DB::table('households')->value('code'));
    }
}

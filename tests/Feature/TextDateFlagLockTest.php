<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * Blank text, dates, on/off flags, the SMS number and "archived by" are locked at
 * the database (migration 2026_11_19_000008), not only by the forms.
 */
class TextDateFlagLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000008_lock_text_dates_flags_and_sms_number.php');
    }

    private function event(array $extra = []): int
    {
        $start = now()->addMonth();

        return DB::table('events')->insertGetId(array_merge([
            'name' => 'Fiesta', 'description' => 'x', 'location' => 'Hall',
            'event_start' => $start->toDateTimeString(), 'event_end' => $start->copy()->addHours(3)->toDateTimeString(),
            'call_time_start' => $start->copy()->subHour()->toDateTimeString(), 'call_time_end' => $start->copy()->addHours(4)->toDateTimeString(),
        ], $extra));
    }

    private function user(array $extra = []): int
    {
        $this->n++;

        return DB::table('users')->insertGetId(array_merge([
            'user_code' => sprintf('PR-%04d', $this->n), 'first_name' => "N{$this->n}", 'last_name' => "T{$this->n}",
            'contact_number' => '09171234567', 'role' => 'Resident',
        ], $extra));
    }

    private function refused(callable $write, string $why): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString($why, $e->getMessage(), 'refused, but not by the expected rule');

            return;
        }
        $this->fail("The database accepted a bad value ({$why})");
    }

    // ------------------------------------------------------------------ blank text

    public function test_names_cannot_be_empty_or_only_spaces(): void
    {
        foreach (['', '   ', "\t"] as $blank) {
            $this->refused(fn () => $this->event(['name' => $blank]), 'Event name cannot be blank');
            $this->refused(fn () => $this->event(['location' => $blank]), 'Event location cannot be blank');
            $this->refused(fn () => DB::table('inventory_items')->insert(['name' => $blank, 'quantity' => 1, 'good_quantity' => 1]), 'Item name cannot be blank');
            $this->refused(fn () => $this->user(['first_name' => $blank]), 'First name cannot be blank');
            $this->refused(fn () => $this->user(['last_name' => $blank]), 'Last name cannot be blank');
        }
        $id = $this->event();
        $this->refused(fn () => DB::table('events')->where('id', $id)->update(['name' => '  ']), 'Event name cannot be blank');
    }

    public function test_real_names_still_save(): void
    {
        $this->event(['name' => 'Fiesta ng Piao', 'location' => 'Covered Court']);
        $this->user(['first_name' => 'Zein', 'last_name' => 'Peña']);
        DB::table('inventory_items')->insert(['name' => 'Chair', 'quantity' => 1, 'good_quantity' => 1]);
        $this->assertSame(1, DB::table('inventory_items')->count());
    }

    // ------------------------------------------------------------------ dates

    public function test_a_birth_date_cannot_be_before_1900_or_in_the_future(): void
    {
        $this->user(['birth_date' => '1900-01-01']);
        $this->user(['birth_date' => now()->subYears(30)->toDateString()]);
        $this->user(['birth_date' => now()->toDateString()]);
        $this->user(['birth_date' => null]);

        $this->refused(fn () => $this->user(['birth_date' => '1899-12-31']), 'Birth date cannot be before 1900');
        $this->refused(fn () => $this->user(['birth_date' => '1066-01-01']), 'Birth date cannot be before 1900');
        $this->refused(fn () => $this->user(['birth_date' => now()->addYear()->toDateString()]), 'Birth date cannot be in the future');
        $this->refused(fn () => $this->user(['birth_date' => '2062-05-05']), 'Birth date cannot be in the future');

        $id = $this->user(['birth_date' => '1990-01-01']);
        $this->refused(fn () => DB::table('users')->where('id', $id)->update(['birth_date' => '2062-05-05']), 'Birth date cannot be in the future');
    }

    public function test_an_older_future_birth_date_does_not_block_other_edits(): void
    {
        $m = $this->migration();
        $m->down();
        $id = $this->user(['birth_date' => '2062-05-05']);   // saved before the lock existed
        $m->up();

        DB::table('users')->where('id', $id)->update(['address' => 'Purok 3', 'first_name' => 'Renamed']);   // unrelated edit still works
        $this->assertSame('Purok 3', DB::table('users')->where('id', $id)->value('address'));

        $this->refused(fn () => DB::table('users')->where('id', $id)->update(['birth_date' => '2063-01-01']), 'Birth date cannot be in the future');
    }

    public function test_an_event_cannot_start_before_2020_or_more_than_three_years_ahead(): void
    {
        $this->event(['event_start' => now()->addYears(2)->toDateTimeString(), 'event_end' => now()->addYears(2)->addHour()->toDateTimeString(),
            'call_time_start' => now()->addYears(2)->subHour()->toDateTimeString(), 'call_time_end' => now()->addYears(2)->addHours(2)->toDateTimeString()]);

        $this->refused(fn () => $this->event(['event_start' => '2019-12-31 09:00:00', 'event_end' => '2019-12-31 12:00:00', 'call_time_start' => '2019-12-31 08:00:00', 'call_time_end' => '2019-12-31 13:00:00']), 'Event start cannot be before 2020');
        $this->refused(fn () => $this->event(['event_start' => '2062-05-05 09:00:00', 'event_end' => '2062-05-05 12:00:00', 'call_time_start' => '2062-05-05 08:00:00', 'call_time_end' => '2062-05-05 13:00:00']), 'Event start cannot be more than 3 years ahead');

        $id = $this->event();
        $this->refused(fn () => DB::table('events')->where('id', $id)->update([
            'event_start' => '2062-05-05 09:00:00', 'event_end' => '2062-05-05 12:00:00', 'call_time_start' => '2062-05-05 08:00:00', 'call_time_end' => '2062-05-05 13:00:00',
        ]), 'Event start cannot be more than 3 years ahead');
    }

    public function test_an_event_already_in_the_past_can_still_be_archived_and_edited(): void
    {
        $id = $this->event(['event_start' => '2026-01-10 09:00:00', 'event_end' => '2026-01-10 12:00:00', 'call_time_start' => '2026-01-10 08:00:00', 'call_time_end' => '2026-01-10 13:00:00']);
        DB::table('events')->where('id', $id)->update(['deleted_at' => now(), 'deleted_by' => 'PR-0001', 'description' => 'closed']);
        $this->assertNotNull(DB::table('events')->where('id', $id)->value('deleted_at'));
    }

    // ------------------------------------------------------------------ yes/no flags

    public function test_on_off_columns_only_hold_0_or_1(): void
    {
        $this->user(['has_account' => 1, 'is_household_head' => 0, 'is_head_staff' => 0, 'must_change_password' => 1]);
        $this->event(['posted_to_facebook' => 1]);

        foreach (['has_account', 'is_household_head', 'is_head_staff', 'must_change_password'] as $col) {
            foreach ([2, -1, 9] as $bad) {
                $this->refused(fn () => $this->user([$col => $bad]), 'On/off values can only be 0 or 1');
            }
        }
        $this->refused(fn () => $this->event(['posted_to_facebook' => 2]), 'On/off values can only be 0 or 1');
        $this->refused(fn () => DB::table('memberships')->insert(['name' => 'Seniors', 'is_active' => 5]), 'On/off values can only be 0 or 1');

        $id = $this->user();
        $this->refused(fn () => DB::table('users')->where('id', $id)->update(['is_head_staff' => 3]), 'On/off values can only be 0 or 1');
    }

    // ------------------------------------------------------------------ SMS number

    public function test_an_sms_number_must_be_a_mobile_number(): void
    {
        foreach (['09171234567', '639171234567'] as $good) {
            DB::table('sms_logs')->insert(['to_number' => $good, 'message' => 'x', 'status' => 'sent']);
        }
        foreach (['0917-123-4567', '+639171234567', '12345', 'abc', '', '091712345678', '0817123456'] as $bad) {
            $this->refused(fn () => DB::table('sms_logs')->insert(['to_number' => $bad, 'message' => 'x', 'status' => 'sent']), 'SMS number must look like');
        }
        $this->refused(fn () => DB::table('sms_logs')->where('to_number', '09171234567')->update(['to_number' => '0917']), 'SMS number must look like');
    }

    // ------------------------------------------------------------------ archived by

    public function test_archived_by_cannot_be_an_empty_text_but_can_be_empty_or_a_code(): void
    {
        $id = $this->event();
        DB::table('events')->where('id', $id)->update(['deleted_by' => 'PR-0001']);
        DB::table('events')->where('id', $id)->update(['deleted_by' => null]);

        foreach (['', '   '] as $blank) {
            $this->refused(fn () => DB::table('events')->where('id', $id)->update(['deleted_by' => $blank]), 'Archived-by cannot be an empty text');
        }
        $this->refused(fn () => DB::table('users')->where('id', $this->user())->update(['deleted_by' => '']), 'Archived-by cannot be an empty text');
    }

    // ------------------------------------------------------------------ the migration itself

    public function test_the_migration_stops_and_changes_nothing_when_stored_rows_already_break_a_rule(): void
    {
        $m = $this->migration();
        $m->down();
        $event = $this->event(['name' => '   ']);
        DB::table('sms_logs')->insert(['to_number' => 'not a number', 'message' => 'x', 'status' => 'sent']);

        try {
            $m->up();
            $this->fail('The migration should have refused to lock over bad rows');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('events (name_not_blank): 1 row(s)', $e->getMessage());
            $this->assertStringContainsString('sms_logs (to_number_format): 1 row(s)', $e->getMessage());
            $this->assertStringContainsString('nothing was changed', $e->getMessage());
        }

        $this->assertSame('   ', DB::table('events')->where('id', $event)->value('name'));   // untouched, and still unlocked
        DB::table('events')->where('id', $event)->update(['name' => 'Fixed']);
        DB::table('sms_logs')->update(['to_number' => '09171234567']);
        $m->up();
        $this->refused(fn () => $this->event(['name' => '']), 'Event name cannot be blank');
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->down();
        $this->user(['birth_date' => '2062-05-05', 'has_account' => 7]);   // allowed while unlocked
        DB::table('users')->delete();
        $m->up();

        $this->refused(fn () => $this->user(['birth_date' => '2062-05-05']), 'Birth date cannot be in the future');
        $this->refused(fn () => $this->user(['has_account' => 7]), 'On/off values can only be 0 or 1');
    }

    public function test_the_forms_still_work_with_these_rules_in_place(): void
    {
        $staff = $this->makeUser('Staff');
        $res = $this->actingAs($staff)->postJson('/events', [
            'name' => 'Fiesta ng Piao', 'description' => 'x', 'location' => 'Covered Court',
            'event_start' => now()->addMonth()->toDateTimeString(), 'event_end' => now()->addMonth()->addHours(3)->toDateTimeString(),
            'call_time_start' => now()->addMonth()->subHour()->toDateTimeString(), 'call_time_end' => now()->addMonth()->addHours(4)->toDateTimeString(),
        ]);
        $this->assertContains($res->getStatusCode(), [200, 201], $res->getContent());
    }

    public function test_the_event_form_gives_a_clear_message_before_the_database_has_to_refuse(): void
    {
        $staff = $this->makeUser('Staff');
        $res = $this->actingAs($staff)->postJson('/events', [
            'name' => 'Far away', 'description' => 'x', 'location' => 'Hall',
            'event_start' => '2062-05-05 09:00:00', 'event_end' => '2062-05-05 12:00:00',
            'call_time_start' => '2062-05-05 08:00:00', 'call_time_end' => '2062-05-05 13:00:00',
        ]);
        $res->assertStatus(422)->assertJsonValidationErrors(['event_start']);
        $this->assertSame(0, DB::table('events')->where('name', 'Far away')->count());
    }
}

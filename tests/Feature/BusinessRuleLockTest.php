<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * The business rules are locked at the database (migration 2026_11_19_000006):
 * rating, money, event times, quantities, allowed words and code formats cannot
 * be broken by any route, not only by the forms.
 */
class BusinessRuleLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000006_lock_business_rules_in_database.php');
    }

    /** A time on a day about a month from now: these events are still open, so money and schedule rules apply to them. */
    private function at(string $time, int $dayOffset = 0): string
    {
        return now()->addMonth()->addDays($dayOffset)->format('Y-m-d') . ' ' . $time;
    }

    private function event(array $extra = []): int
    {
        return DB::table('events')->insertGetId(array_merge([
            'name' => 'Fiesta', 'description' => 'x', 'location' => 'Hall',
            'event_start' => $this->at('09:00:00'), 'event_end' => $this->at('12:00:00'),
            'call_time_start' => $this->at('08:00:00'), 'call_time_end' => $this->at('13:00:00'),
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

    private function item(array $extra = []): int
    {
        $this->n++;

        return DB::table('inventory_items')->insertGetId(array_merge(['name' => "Chair {$this->n}", 'quantity' => 4, 'good_quantity' => 4], $extra));
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

    // ------------------------------------------------------------------ rating

    public function test_a_rating_must_be_from_1_to_5(): void
    {
        $event = $this->event();
        foreach ([1, 3, 5] as $good) {
            DB::table('feedback')->insert(['event_id' => $event, 'user_id' => $this->user(), 'rating' => $good]);
        }
        foreach ([0, 6, -1, 99] as $bad) {
            $this->refused(fn () => DB::table('feedback')->insert(['event_id' => $event, 'user_id' => $this->user(), 'rating' => $bad]), 'Rating must be from 1 to 5');
        }
        $this->refused(fn () => DB::table('feedback')->where('rating', 3)->update(['rating' => 9]), 'Rating must be from 1 to 5');
    }

    // ------------------------------------------------------------------ money

    public function test_an_expense_amount_must_be_more_than_zero_and_within_the_limit(): void
    {
        $event = $this->event();
        foreach ([0.01, 250.5, 99999999.99] as $good) {
            DB::table('event_expenses')->insert(['event_id' => $event, 'item' => 'x', 'amount' => $good]);
        }
        foreach ([0, -5, 100000000, 99999999.995] as $bad) {
            $this->refused(fn () => DB::table('event_expenses')->insert(['event_id' => $event, 'item' => 'x', 'amount' => $bad]), 'Expense amount');
        }
        $this->refused(fn () => DB::table('event_expenses')->where('amount', 250.5)->update(['amount' => -1]), 'Expense amount');
    }

    public function test_an_approved_budget_may_be_empty_zero_or_up_to_the_limit_but_never_negative_or_over(): void
    {
        $this->event(['approved_budget' => null]);
        $this->event(['approved_budget' => 0]);
        $this->event(['approved_budget' => 99999999.99]);

        foreach ([-0.01, 100000000] as $bad) {
            $this->refused(fn () => $this->event(['approved_budget' => $bad]), 'Approved budget');
        }
        $id = $this->event();
        $this->refused(fn () => DB::table('events')->where('id', $id)->update(['approved_budget' => -10]), 'Approved budget');
    }

    // ------------------------------------------------------------------ event times

    public function test_an_event_must_end_after_it_starts(): void
    {
        $this->event(['event_end' => null, 'call_time_end' => null]);   // older open-ended events stay valid

        $this->refused(fn () => $this->event(['event_end' => $this->at('09:00:00')]), 'must end after it starts');
        $this->refused(fn () => $this->event(['event_end' => $this->at('08:30:00'), 'call_time_end' => $this->at('13:00:00')]), 'must end after it starts');

        $id = $this->event();
        $this->refused(fn () => DB::table('events')->where('id', $id)->update(['event_end' => $this->at('12:00:00', -1)]), 'must end after it starts');
    }

    public function test_call_time_must_open_before_the_event_starts(): void
    {
        $this->refused(fn () => $this->event(['call_time_start' => $this->at('09:00:00')]), 'Call time start must be before');   // equal is not allowed
        $this->refused(fn () => $this->event(['call_time_start' => $this->at('09:30:00')]), 'Call time start must be before');

        $id = $this->event();
        $this->refused(fn () => DB::table('events')->where('id', $id)->update(['call_time_start' => $this->at('10:00:00')]), 'Call time start must be before');
    }

    public function test_call_time_must_not_close_before_the_event_ends(): void
    {
        $this->event(['call_time_end' => $this->at('12:00:00')]);   // exactly at the end is fine

        $this->refused(fn () => $this->event(['call_time_end' => $this->at('11:59:00')]), 'Call time end cannot be before');

        $id = $this->event();
        $this->refused(fn () => DB::table('events')->where('id', $id)->update(['call_time_end' => $this->at('10:00:00')]), 'Call time end cannot be before');
    }

    public function test_call_time_end_must_be_after_call_time_start(): void
    {
        // an open-ended event has no end to compare, so only the call window protects it
        $this->refused(fn () => $this->event(['event_end' => null, 'call_time_start' => $this->at('08:00:00'), 'call_time_end' => $this->at('07:00:00')]), 'Call time end must be after call time start');
    }

    public function test_a_time_out_cannot_be_before_the_time_in(): void
    {
        // an event with no end has no sign-out window, so only the order rule judges the times
        $event = $this->event(['event_start' => '2026-10-10 09:00:00', 'call_time_start' => '2026-10-10 08:00:00', 'event_end' => null, 'call_time_end' => null]);   // past, so the sign-in times are real
        $a = DB::table('attendances')->insertGetId(['event_id' => $event, 'user_id' => $this->user(), 'time_in' => '2026-10-10 08:30:00', 'time_out' => null, 'status' => 'Incomplete']);
        DB::table('attendances')->insert(['event_id' => $event, 'user_id' => $this->user(), 'time_in' => '2026-10-10 08:30:00', 'time_out' => '2026-10-10 11:00:00', 'status' => 'Complete']);
        DB::table('attendances')->insert(['event_id' => $event, 'user_id' => $this->user(), 'time_in' => null, 'time_out' => '2026-10-10 11:00:00', 'status' => 'Incomplete']);

        $this->refused(fn () => DB::table('attendances')->insert(['event_id' => $event, 'user_id' => $this->user(), 'time_in' => '2026-10-10 08:30:00', 'time_out' => '2026-10-10 08:00:00', 'status' => 'Complete']), 'Time out cannot be before time in');
        $this->refused(fn () => DB::table('attendances')->where('id', $a)->update(['time_out' => '2026-10-10 08:00:00']), 'Time out cannot be before time in');
    }

    // ------------------------------------------------------------------ quantities

    public function test_inventory_counts_cannot_be_negative_in_any_table(): void
    {
        $event = $this->event();
        $item = $this->item();

        foreach (['quantity', 'lost_quantity', 'new_quantity', 'good_quantity', 'fair_quantity', 'poor_quantity'] as $col) {
            $this->refused(fn () => DB::table('inventory_items')->where('id', $item)->update([$col => -1]), 'Inventory counts cannot be negative');
        }

        $this->refused(fn () => DB::table('event_inventory_items')->insert(['event_id' => $event, 'inventory_item_id' => $item, 'quantity' => -1]), 'Inventory counts cannot be negative');
        $this->refused(fn () => DB::table('event_inventory_items')->insert(['event_id' => $event, 'inventory_item_id' => $item, 'quantity' => 1, 'poor_quantity' => -2]), 'Inventory counts cannot be negative');
        $this->refused(fn () => DB::table('event_inventory_releases')->insert(['event_id' => $event, 'inventory_item_id' => $item, 'quantity' => -3]), 'Inventory counts cannot be negative');
        $this->refused(fn () => DB::table('inventory_unit_logs')->insert(['inventory_item_id' => $item, 'action' => 'lost', 'quantity' => -1]), 'Inventory counts cannot be negative');

        $this->loanRow($event, $item, 2);
        $release = DB::table('event_inventory_releases')->insertGetId(['event_id' => $event, 'inventory_item_id' => $item, 'quantity' => 2, 'good_quantity' => 2]);
        $this->refused(fn () => DB::table('event_inventory_release_undos')->insert(['event_inventory_release_id' => $release, 'quantity' => -1]), 'Inventory counts cannot be negative');

        // zero is a valid count
        DB::table('inventory_items')->where('id', $item)->update(['lost_quantity' => 0]);
        DB::table('inventory_unit_logs')->insert(['inventory_item_id' => $item, 'action' => 'adjusted', 'quantity' => 0]);
    }

    public function test_feedback_time_limits_and_failed_logins_cannot_be_negative(): void
    {
        $event = $this->event();
        // a negative window is refused by this rule and by the stricter 1-168 / 1-120 range rule (migration 000015); either message is right
        foreach ([['close_after_hours' => -1], ['edit_window_minutes' => -5]] as $bad) {
            try {
                DB::table('feedback')->insert(['event_id' => $event, 'user_id' => $this->user(), 'rating' => 4] + $bad);
                $this->fail('The database accepted a negative feedback window.');
            } catch (QueryException $e) {
                $this->assertMatchesRegularExpression('/Feedback time limits cannot be negative|window must be from 1 to/', $e->getMessage());
            }
        }
        $this->refused(fn () => $this->user(['failed_login_attempts' => -1]), 'Failed login attempts cannot be negative');
    }

    // ------------------------------------------------------------------ allowed words

    public function test_only_the_allowed_user_words_are_accepted(): void
    {
        foreach (['Staff', 'Resident'] as $role) {
            $this->user(['role' => $role]);
        }
        $this->refused(fn () => $this->user(['role' => 'Admin']), 'Role must be Staff or Resident');
        $this->refused(fn () => $this->user(['role' => '']), 'Role must be Staff or Resident');

        $this->user(['gender' => null]);
        $this->user(['gender' => 'Female']);
        $this->refused(fn () => $this->user(['gender' => 'Other']), 'Gender must be Male or Female');

        foreach (['en', 'tl', 'ceb'] as $lang) {
            $this->user(['preferred_language' => $lang]);
        }
        $this->refused(fn () => $this->user(['preferred_language' => 'fr']), 'Language must be');

        $this->user(['barangay_position' => 'captain']);
        $this->user(['barangay_position' => null]);
        $this->refused(fn () => $this->user(['barangay_position' => 'mayor']), 'Barangay position must be');

        $id = $this->user();
        $this->refused(fn () => DB::table('users')->where('id', $id)->update(['role' => 'Superuser']), 'Role must be Staff or Resident');
    }

    public function test_only_the_allowed_status_action_and_type_words_are_accepted(): void
    {
        $event = $this->event();
        $item = $this->item();

        foreach (['missed', 'Incomplete', 'Complete', 'complete'] as $status) {
            DB::table('attendances')->insert(['event_id' => $event, 'user_id' => $this->user(), 'status' => $status]);
        }
        $this->refused(fn () => DB::table('attendances')->insert(['event_id' => $event, 'user_id' => $this->user(), 'status' => 'attended']), 'Attendance status is not recognised');

        foreach (['simulated', 'sent', 'failed'] as $status) {
            DB::table('sms_logs')->insert(['to_number' => '09171234567', 'message' => 'x', 'status' => $status]);
        }
        $this->refused(fn () => DB::table('sms_logs')->insert(['to_number' => '09171234567', 'message' => 'x', 'status' => 'delivered']), 'SMS status is not recognised');

        foreach (['added', 'adjusted', 'lost', 'found', 'disposed', 'restored'] as $action) {   // disposed/restored = old history that must stay
            DB::table('inventory_unit_logs')->insert(['inventory_item_id' => $item, 'action' => $action, 'quantity' => 1]);
        }
        $this->refused(fn () => DB::table('inventory_unit_logs')->insert(['inventory_item_id' => $item, 'action' => 'stolen', 'quantity' => 1]), 'Stock log action is not recognised');
    }

    // ------------------------------------------------------------------ code format (regex)

    public function test_user_codes_must_look_exactly_like_pr_and_digits(): void
    {
        foreach (['PR-0001', 'PR-0150', 'PR-10000', 'PR-123456'] as $i => $good) {
            $this->user(['user_code' => $good]);
        }
        foreach (['PR-0001gggg', 'PR-001', 'PR-', 'PR0001', 'pr-0002', 'Pr-0002', 'PR-00 01', 'PR-0001-', 'XX-0001', 'STAFF-0001', ' PR-0001', 'PR-0001 ', "PR-0001\n", 'PR-00/01', '', "PR-1'; DROP TABLE users;--", 'PR-ñ001', '<b>PR-1</b>'] as $bad) {
            $this->refused(fn () => $this->user(['user_code' => $bad]), 'User code must look like PR-0001');
        }
        $id = $this->user(['user_code' => 'PR-0777']);
        $this->refused(fn () => DB::table('users')->where('id', $id)->update(['user_code' => 'PR-0777gggg']), 'User code must look like PR-0001');
    }

    public function test_household_codes_must_look_exactly_like_hh_and_digits(): void
    {
        foreach (['HH-0001', 'HH-0042', 'HH-12345'] as $good) {
            DB::table('households')->insert(['code' => $good, 'address' => 'P1']);
        }
        foreach (['HH-0001x', 'HH-1', 'hh-0002', 'HH0002', 'HH-', 'PR-0002', 'HH 0002', ''] as $bad) {
            $this->refused(fn () => DB::table('households')->insert(['code' => $bad, 'address' => 'P1']), 'Household code must look like HH-0001');
        }
        $this->refused(fn () => DB::table('households')->where('code', 'HH-0042')->update(['code' => 'HH-0042a']), 'Household code must look like HH-0001');
    }

    public function test_the_code_migration_repairs_obvious_codes_and_keeps_every_copy_in_step(): void
    {
        $m = require database_path('migrations/2026_11_19_000007_uniform_user_and_household_codes.php');
        $m->down();   // back to the loose letters-digits-dashes rule, so legacy-style codes can be stored

        $a = $this->user(['user_code' => 'PR-0001gggg']);
        $b = $this->user(['user_code' => 'pr-7']);
        $ok = $this->user(['user_code' => 'PR-0003']);
        $hh = DB::table('households')->insertGetId(['code' => 'HH-0009x', 'address' => 'P1']);
        DB::table('users')->where('id', $ok)->update(['household_code' => 'HH-0009x', 'household_id' => $hh]);
        DB::table('activity_logs')->insert(['user_code' => 'PR-0001gggg', 'action' => 'Update', 'module' => 'User', 'description' => 'x']);
        DB::table('inventory_unit_logs')->insert(['inventory_item_id' => $this->item(), 'action' => 'added', 'quantity' => 1, 'user_code' => 'pr-7']);

        $this->withoutTimeLocks(fn () => $m->up());   // the repair rewrites the activity log's codes, which is only possible with the add-only lock lifted

        $this->assertSame('PR-0001', DB::table('users')->where('id', $a)->value('user_code'));
        $this->assertSame('PR-0007', DB::table('users')->where('id', $b)->value('user_code'));
        $this->assertSame('PR-0003', DB::table('users')->where('id', $ok)->value('user_code'));
        $this->assertSame('HH-0009', DB::table('households')->where('id', $hh)->value('code'));
        $this->assertSame('HH-0009', DB::table('users')->where('id', $ok)->value('household_code'));
        $this->assertSame(1, DB::table('activity_logs')->where('user_code', 'PR-0001')->count());
        $this->assertSame(0, DB::table('activity_logs')->where('user_code', 'PR-0001gggg')->count());
        $this->assertSame('PR-0007', DB::table('inventory_unit_logs')->value('user_code'));

        $this->refused(fn () => $this->user(['user_code' => 'PR-0001gggg']), 'User code must look like PR-0001');
    }

    public function test_the_code_migration_stops_and_changes_nothing_when_a_code_cannot_be_repaired_safely(): void
    {
        $m = require database_path('migrations/2026_11_19_000007_uniform_user_and_household_codes.php');
        $m->down();

        $fixable = $this->user(['user_code' => 'PR-0005zz']);
        $this->user(['user_code' => 'PR-0005']);              // the repaired code is already taken
        $this->user(['user_code' => 'STAFF-77']);             // not a PR code at all

        try {
            $m->up();
            $this->fail('The migration should have refused');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString("'PR-0005zz' would become PR-0005, but that code is already used", $e->getMessage());
            $this->assertStringContainsString("'STAFF-77'", $e->getMessage());
            $this->assertStringContainsString('nothing was changed', $e->getMessage());
        }
        $this->assertSame('PR-0005zz', DB::table('users')->where('id', $fixable)->value('user_code'));
    }

    // ------------------------------------------------------------------ the migration itself

    public function test_the_migration_stops_and_changes_nothing_when_stored_rows_already_break_a_rule(): void
    {
        $m = $this->migration();
        $m->down();   // lift the locks so legacy-style bad rows can be stored
        $event = $this->event();
        DB::table('feedback')->insert(['event_id' => $event, 'user_id' => $this->user(), 'rating' => 9]);
        DB::table('event_expenses')->insert(['event_id' => $event, 'item' => 'x', 'amount' => -4]);

        try {
            $m->up();
            $this->fail('The migration should have refused to lock over bad rows');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('feedback (rating_range): 1 row(s)', $e->getMessage());
            $this->assertStringContainsString('event_expenses (amount_range): 1 row(s)', $e->getMessage());
            $this->assertStringContainsString('nothing was changed', $e->getMessage());
        }

        // nothing was locked, and nothing was edited
        DB::table('feedback')->insert(['event_id' => $event, 'user_id' => $this->user(), 'rating' => 8]);
        $this->assertSame(9, (int) DB::table('feedback')->orderBy('id')->value('rating'));

        // once the rows are corrected the migration goes through and locks again
        DB::table('feedback')->update(['rating' => 5]);
        DB::table('event_expenses')->update(['amount' => 4]);
        $m->up();
        $this->refused(fn () => DB::table('feedback')->insert(['event_id' => $event, 'user_id' => $this->user(), 'rating' => 7]), 'Rating must be from 1 to 5');
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->down();
        DB::table('feedback')->insert(['event_id' => $this->event(), 'user_id' => $this->user(), 'rating' => 7]);   // allowed while unlocked
        DB::table('feedback')->delete();
        $m->up();

        $this->refused(fn () => DB::table('feedback')->insert(['event_id' => $this->event(), 'user_id' => $this->user(), 'rating' => 7]), 'Rating must be from 1 to 5');
    }

    public function test_the_forms_still_work_with_the_database_rules_in_place(): void
    {
        // a normal resident and a normal event, created the way the app creates them
        $resident = $this->makeUser('Resident');
        $this->assertDatabaseHas('users', ['id' => $resident->id]);
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9-]+$/', $resident->user_code);
    }
}

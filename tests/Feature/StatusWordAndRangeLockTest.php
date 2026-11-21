<?php

namespace Tests\Feature;

use App\Models\CurrentStatus;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Status words and number ranges held by the database (migration 2026_11_19_000015).
 */
class StatusWordAndRangeLockTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000015_lock_status_words_and_number_ranges.php');
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

    private function user(): int
    {
        $this->n++;

        return DB::table('users')->insertGetId([
            'user_code' => sprintf('PR-%04d', $this->n), 'first_name' => "N{$this->n}", 'last_name' => "T{$this->n}",
            'contact_number' => '09171234567', 'role' => 'Staff',
        ]);
    }

    private function transfer(string $status): int
    {
        return DB::table('head_staff_transfers')->insertGetId([
            'from_user_id' => $this->user(), 'to_user_id' => $this->user(), 'status' => $status,
            'expires_at' => now()->addHours(24)->toDateTimeString(),
        ]);
    }

    private function edit(string $kind, ?int $rating = null): int
    {
        return DB::table('feedback_edits')->insertGetId(['kind' => $kind, 'item_id' => 1, 'rating' => $rating]);
    }

    private function bracket(int $min, ?int $max, int $order = 1): int
    {
        return DB::table('age_brackets')->insertGetId(['label' => 'Group ' . ++$this->n, 'min_age' => $min, 'max_age' => $max, 'sort_order' => $order]);
    }

    private function feedback(array $extra = []): int
    {
        $event = DB::table('events')->insertGetId([
            'name' => 'Fiesta ' . ++$this->n, 'description' => 'x', 'location' => 'Hall ' . $this->n,
            'event_start' => '2026-10-10 09:00:00', 'event_end' => '2026-10-10 12:00:00',
        ]);

        return DB::table('feedback')->insertGetId(array_merge(['event_id' => $event, 'user_id' => $this->user(), 'rating' => 4], $extra));
    }

    // ---------- allowed words ----------

    public function test_a_transfer_status_must_be_one_of_the_four(): void
    {
        foreach (['pending', 'accepted', 'cancelled', 'expired'] as $status) {
            $this->transfer($status);
        }
        $this->assertSame(4, DB::table('head_staff_transfers')->count());

        foreach (['approved', 'Pending ', 'PENDING', ''] as $bad) {
            $this->refused(fn () => $this->transfer($bad), 'Transfer status is not recognised');
        }
        $id = DB::table('head_staff_transfers')->value('id');
        $this->refused(fn () => DB::table('head_staff_transfers')->where('id', $id)->update(['status' => 'approved']), 'Transfer status is not recognised');
        DB::table('head_staff_transfers')->where('id', $id)->update(['status' => 'expired']);
        $this->assertSame(4, DB::table('head_staff_transfers')->count());
    }

    public function test_every_transfer_status_the_app_writes_is_allowed(): void
    {
        $code = file_get_contents(app_path('Http/Controllers/StaffAccountController.php'));
        preg_match_all("/'status'\s*=>\s*'([a-z]+)'/", $code, $m);
        $written = array_unique($m[1]);

        $this->assertNotEmpty($written);
        $this->assertSame([], array_values(array_diff($written, $this->migration()::TRANSFER_STATUSES)), 'the app writes a status the database would refuse');
    }

    public function test_a_feedback_history_kind_must_be_rating_or_absence(): void
    {
        $this->edit('rating', 5);
        $this->edit('absence');

        foreach (['ratings', 'reason', 'Rating', ''] as $bad) {
            $this->refused(fn () => $this->edit($bad), 'Feedback history kind is not recognised');
        }
        $this->assertSame(2, DB::table('feedback_edits')->count());
    }

    public function test_a_status_category_must_be_one_the_app_knows(): void
    {
        $this->assertSame(CurrentStatus::CATEGORIES, $this->migration()::STATUS_CATEGORIES);   // same list as the app

        foreach (CurrentStatus::CATEGORIES as $category) {
            DB::table('current_statuses')->insert(['label' => "S {$category}", 'category' => $category, 'sort_order' => 1]);
        }
        foreach (['Employment', 'work', ''] as $bad) {
            $this->refused(fn () => DB::table('current_statuses')->insert(['label' => "Bad {$bad}", 'category' => $bad, 'sort_order' => 1]), 'Status category is not recognised');
        }
        $id = DB::table('current_statuses')->value('id');
        $this->refused(fn () => DB::table('current_statuses')->where('id', $id)->update(['category' => 'work']), 'Status category is not recognised');
    }

    // ---------- number ranges ----------

    public function test_age_brackets_need_sensible_ages(): void
    {
        $this->bracket(0, 12);
        $this->bracket(60, null);     // no upper limit
        $this->bracket(30, 30);       // a single age
        $this->bracket(0, 120);

        $this->refused(fn () => $this->bracket(60, 30), 'Maximum age cannot be below the minimum');
        $this->refused(fn () => $this->bracket(-1, 10), 'Minimum age must be from 0 to 120');
        $this->refused(fn () => $this->bracket(121, null), 'Minimum age must be from 0 to 120');
        $this->refused(fn () => $this->bracket(10, 121), 'Maximum age cannot be below the minimum or above 120');

        $id = $this->bracket(18, 59);
        $this->refused(fn () => DB::table('age_brackets')->where('id', $id)->update(['max_age' => 10]), 'Maximum age cannot be below the minimum');
        $this->refused(fn () => DB::table('age_brackets')->where('id', $id)->update(['min_age' => 70]), 'Maximum age cannot be below the minimum');   // raising the minimum above the maximum
        DB::table('age_brackets')->where('id', $id)->update(['min_age' => 20, 'max_age' => 64]);
        $this->assertSame(64, (int) DB::table('age_brackets')->where('id', $id)->value('max_age'));
    }

    public function test_the_display_order_of_a_lookup_list_cannot_be_negative(): void
    {
        $this->bracket(0, 5, 0);
        $this->refused(fn () => $this->bracket(6, 9, -1), 'Sort order cannot be negative');
        $this->refused(fn () => DB::table('civil_statuses')->insert(['label' => 'X', 'sort_order' => -3]), 'Sort order cannot be negative');
        $this->refused(fn () => DB::table('current_statuses')->insert(['label' => 'X', 'category' => 'other', 'sort_order' => -3]), 'Sort order cannot be negative');
        $this->refused(fn () => DB::table('name_suffixes')->insert(['name' => 'X', 'sort_order' => -3]), 'Sort order cannot be negative');
        $before = DB::table('civil_statuses')->count();   // the migrations seed some
        DB::table('civil_statuses')->insert(['label' => 'Single (test)', 'sort_order' => 1]);
        $this->assertSame($before + 1, DB::table('civil_statuses')->count());
    }

    public function test_the_feedback_windows_stay_inside_what_the_settings_form_allows(): void
    {
        $this->feedback();                                                                  // defaults 12 h and 20 min
        $this->feedback(['close_after_hours' => 1, 'edit_window_minutes' => 1]);
        $this->feedback(['close_after_hours' => 168, 'edit_window_minutes' => 120]);

        foreach ([0, 169, 9999] as $hours) {
            $this->refused(fn () => $this->feedback(['close_after_hours' => $hours]), 'submit window must be from 1 to 168 hours');
        }
        foreach ([0, 121, 9999] as $minutes) {
            $this->refused(fn () => $this->feedback(['edit_window_minutes' => $minutes]), 'edit window must be from 1 to 120 minutes');
        }
        $id = DB::table('feedback')->value('id');
        $this->refused(fn () => DB::table('feedback')->where('id', $id)->update(['close_after_hours' => 0]), 'submit window');
        DB::table('feedback')->where('id', $id)->update(['staff_reply' => 'Thank you']);   // other edits are not judged
    }

    public function test_the_rating_in_an_edit_history_is_from_one_to_five(): void
    {
        foreach ([1, 3, 5] as $r) {
            $this->edit('rating', $r);
        }
        $this->edit('absence', null);   // a reason has no rating

        foreach ([0, 6, -1] as $bad) {
            $this->refused(fn () => $this->edit('rating', $bad), 'Rating must be from 1 to 5');
        }
        $this->assertSame(4, DB::table('feedback_edits')->count());
    }

    // ---------- the migration itself ----------

    public function test_the_migration_stops_and_changes_nothing_when_stored_rows_already_break_a_rule(): void
    {
        $m = $this->migration();
        $m->down();
        $this->transfer('approved');
        $this->bracket(60, 30);
        DB::table('current_statuses')->insert(['label' => 'Odd', 'category' => 'work', 'sort_order' => 1]);

        try {
            $m->up();
            $this->fail('The migration should have stopped.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('head_staff_transfers (status_values)', $e->getMessage());
            $this->assertStringContainsString('age_brackets (max_age_range)', $e->getMessage());
            $this->assertStringContainsString('current_statuses (category_values)', $e->getMessage());
            $this->assertStringContainsString("'approved'", $e->getMessage());
            $this->assertStringContainsString("'work'", $e->getMessage());
        }

        $this->transfer('anything');   // nothing was locked, so bad values are still accepted
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->down();
        $this->transfer('approved');           // allowed while unlocked
        DB::table('head_staff_transfers')->delete();
        $m->up();
        $m->down();
        $m->up();

        $this->refused(fn () => $this->transfer('approved'), 'Transfer status is not recognised');
    }

    public function test_the_forms_that_write_these_tables_still_work(): void
    {
        $staff = \App\Models\User::create([
            'user_code' => 'PR-9001', 'first_name' => 'Head', 'last_name' => 'Staff', 'contact_number' => '09171230001',
            'role' => 'Staff', 'password' => bcrypt('x'), 'has_account' => 1, 'is_head_staff' => 1,
        ]);

        DB::table('age_brackets')->delete();   // the seeded brackets would overlap
        $this->actingAs($staff)->postJson('/age-brackets', ['label' => 'Young Adults', 'min_age' => 18, 'max_age' => 35])->assertStatus(201);
        $this->actingAs($staff)->postJson('/age-brackets', ['label' => 'Backwards', 'min_age' => 40, 'max_age' => 20])->assertStatus(422);
    }
}

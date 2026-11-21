<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support;
use Tests\TestCase;

/**
 * A time that records when something happened cannot be in the future, whatever route writes it
 * (migration 2026_11_19_000014). Times that plan something may be.
 */
class NoFutureTimeLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private const WHY = 'A time that records when something happened cannot be in the future';

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000014_lock_recorded_times_against_the_future.php');
    }

    private function refused(callable $write): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString(self::WHY, $e->getMessage(), 'refused, but not by the expected rule');

            return;
        }
        $this->fail('The database accepted a time in the future.');
    }

    private function log(array $extra = []): int
    {
        return DB::table('activity_logs')->insertGetId(array_merge([
            'user_code' => 'PR-0001', 'action' => 'Test', 'module' => 'Events', 'description' => 'x',
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

    private function event(array $extra = []): int
    {
        $this->n++;

        return DB::table('events')->insertGetId(array_merge([
            'name' => "Fiesta {$this->n}", 'description' => 'x', 'location' => "Hall {$this->n}",
            'event_start' => now()->addDays(5)->toDateTimeString(), 'event_end' => now()->addDays(5)->addHours(3)->toDateTimeString(),
        ], $extra));
    }

    // ---------- created / updated / archived ----------

    public function test_a_record_cannot_be_created_or_updated_with_a_future_time(): void
    {
        $this->refused(fn () => $this->log(['created_at' => now()->addDay()->toDateTimeString()]));
        $this->refused(fn () => $this->log(['updated_at' => now()->addHours(2)->toDateTimeString()]));
        $this->assertSame(0, DB::table('activity_logs')->count());

        $id = $this->log();
        $this->withoutTimeLocks(function () use ($id) {   // the written-once and add-only locks are lifted so only this rule is judged
            $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['created_at' => now()->addYear()->toDateTimeString()]));
            $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['updated_at' => now()->addMinutes(10)->toDateTimeString()]));
        });
    }

    public function test_now_the_past_and_a_few_seconds_of_clock_difference_are_accepted(): void
    {
        $this->log(['created_at' => now()->toDateTimeString()]);
        $this->log(['created_at' => now()->subYears(3)->toDateTimeString()]);
        $this->log(['created_at' => now()->addSeconds(30)->toDateTimeString()]);   // one minute of grace
        $this->refused(fn () => $this->log(['created_at' => now()->addMinutes(5)->toDateTimeString()]));

        $this->assertSame(3, DB::table('activity_logs')->count());
    }

    public function test_an_archive_time_cannot_be_in_the_future(): void
    {
        $event = $this->event();

        $this->refused(fn () => DB::table('events')->where('id', $event)->update(['deleted_at' => now()->addDay()->toDateTimeString(), 'deleted_by' => 'PR-0001']));
        DB::table('events')->where('id', $event)->update(['deleted_at' => now()->toDateTimeString(), 'deleted_by' => 'PR-0001']);
        $this->assertNotNull(DB::table('events')->where('id', $event)->value('deleted_at'));
    }

    // ---------- sign-in and sign-out ----------

    public function test_a_sign_in_or_sign_out_cannot_be_in_the_future(): void
    {
        // an event with no call time lets anyone sign in until it starts, so only the clock refuses these
        $event = $this->event();
        $user = $this->user();
        $row = fn (array $t) => DB::table('attendances')->insert(['event_id' => $event, 'user_id' => $user, 'status' => 'Incomplete'] + $t);

        $this->refused(fn () => $row(['time_in' => now()->addDay()->toDateTimeString()]));
        $this->refused(fn () => $row(['time_out' => now()->addDays(6)->toDateTimeString()]));
        $this->assertSame(0, DB::table('attendances')->count());

        $row(['time_in' => now()->subMinute()->toDateTimeString()]);
        $id = DB::table('attendances')->value('id');
        $this->refused(fn () => DB::table('attendances')->where('id', $id)->update(['time_out' => now()->addHour()->toDateTimeString()]));
    }

    // ---------- account times ----------

    public function test_account_times_such_as_last_login_cannot_be_in_the_future(): void
    {
        $user = $this->user();

        foreach (['last_login_at', 'suspended_at', 'password_changed_at', 'two_factor_confirmed_at'] as $column) {
            $this->refused(fn () => DB::table('users')->where('id', $user)->update([$column => now()->addDay()->toDateTimeString()]));
            DB::table('users')->where('id', $user)->update([$column => now()->subHour()->toDateTimeString()]);
        }
    }

    // ---------- times that plan something may be in the future ----------

    public function test_planned_times_may_lie_in_the_future(): void
    {
        $event = $this->event(['call_time_start' => now()->addDays(4)->toDateTimeString(), 'call_time_end' => now()->addDays(6)->toDateTimeString()]);
        DB::table('events')->where('id', $event)->update(['event_start' => now()->addDays(8)->toDateTimeString(), 'event_end' => now()->addDays(8)->addHours(2)->toDateTimeString(), 'call_time_end' => now()->addDays(9)->toDateTimeString()]);

        $user = $this->user();
        DB::table('users')->where('id', $user)->update(['locked_until' => now()->addMinutes(15)->toDateTimeString()]);

        $this->assertNotNull(DB::table('users')->where('id', $user)->value('locked_until'));
        $this->assertSame(now()->addDays(9)->toDateString(), substr((string) DB::table('events')->where('id', $event)->value('call_time_end'), 0, 10));
    }

    // ---------- judged only on change ----------

    public function test_a_future_time_stored_before_the_lock_never_blocks_an_unrelated_edit(): void
    {
        $m = $this->migration();
        $m->down();
        $id = $this->log(['created_at' => now()->addDays(3)->toDateTimeString()]);   // bad data from before the lock
        $m->up();                                                                       // the migration does not scan, so it cannot fail on it

        $this->withoutTimeLocks(function () use ($id) {   // with the written-once and add-only locks lifted
            DB::table('activity_logs')->where('id', $id)->update(['description' => 'edited']);   // other columns are free
            $this->assertSame('edited', DB::table('activity_logs')->where('id', $id)->value('description'));

            $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['created_at' => now()->addDays(4)->toDateTimeString()]));   // but moving it is judged
            DB::table('activity_logs')->where('id', $id)->update(['created_at' => now()->subDay()->toDateTimeString()]);                              // and fixing it is welcome
        });
    }

    public function test_the_lock_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->down();
        $this->log(['created_at' => now()->addDay()->toDateTimeString()]);   // accepted while unlocked
        $this->withoutTimeLocks(fn () => DB::table('activity_logs')->delete());
        $m->up();
        $m->up();

        $this->refused(fn () => $this->log(['created_at' => now()->addDay()->toDateTimeString()]));
    }

    // ---------- every date-time column is classified ----------

    public function test_every_date_time_column_is_either_recorded_or_planned(): void
    {
        $m = $this->migration();
        $listed = [];
        foreach ([$m::RECORDED, $m::PLANNED] as $group) {
            foreach ($group as $table => $columns) {
                foreach ($columns as $column) {
                    $listed[] = "{$table}.{$column}";
                }
            }
        }
        $this->assertSame($listed, array_values(array_unique($listed)), 'a column is in both lists, or twice');

        $found = [];
        foreach (Schema::getTables() as $table) {
            foreach (Schema::getColumns($table['name']) as $column) {
                if (in_array(strtolower($column['type_name']), ['datetime', 'timestamp'], true)) {
                    $found[] = "{$table['name']}.{$column['name']}";
                }
            }
        }
        // framework tables that hold plain numbers or are not part of the system's records
        $found = array_filter($found, fn ($c) => !preg_match('/^(sessions|cache|cache_locks|jobs|job_batches|failed_jobs|migrations|password_reset_tokens|personal_access_tokens)\./', $c));

        $this->assertSame([], array_values(array_diff($found, $listed)), 'a date-time column has not been classified as recorded or planned');
        $this->assertSame([], array_values(array_diff($listed, $found)), 'a classified column does not exist');
    }
}

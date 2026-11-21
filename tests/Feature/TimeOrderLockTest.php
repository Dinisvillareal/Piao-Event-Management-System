<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * A time cannot come before the time it follows (migration 2026_11_19_000017).
 */
class TimeOrderLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000017_lock_time_order.php');
    }

    private function refused(callable $write, string $why): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString($why, $e->getMessage(), 'refused, but not by the expected rule');

            return;
        }
        $this->fail("The database accepted a time out of order ({$why})");
    }

    private ?\Illuminate\Support\Carbon $base = null;

    private function ago(int $days): string
    {
        // one fixed "now" for the whole test, so two calls a second apart still give the same text
        $this->base ??= now()->startOfSecond();

        return $this->base->copy()->subDays($days)->toDateTimeString();
    }

    private function log(array $extra = []): int
    {
        return DB::table('activity_logs')->insertGetId(array_merge(['user_code' => 'PR-0001', 'action' => 'Test', 'module' => 'Events', 'description' => 'x'], $extra));
    }

    private function user(): int
    {
        $this->n++;

        return DB::table('users')->insertGetId([
            'user_code' => sprintf('PR-%04d', 700 + $this->n), 'first_name' => "N{$this->n}", 'last_name' => "T{$this->n}",
            'contact_number' => '09171234567', 'role' => 'Staff',
        ]);
    }

    private function feedback(array $extra = []): int
    {
        $event = DB::table('events')->insertGetId([
            'name' => 'Fiesta ' . ++$this->n, 'description' => 'x', 'location' => 'Hall ' . $this->n,
            'event_start' => '2026-10-10 09:00:00', 'event_end' => '2026-10-10 12:00:00',
        ]);

        return DB::table('feedback')->insertGetId(array_merge(['event_id' => $event, 'user_id' => $this->user(), 'rating' => 4], $extra));
    }

    // ---------- created / updated ----------

    public function test_a_record_cannot_be_updated_before_it_was_created(): void
    {
        $this->log(['created_at' => $this->ago(2), 'updated_at' => $this->ago(2)]);   // equal is fine
        $this->log(['created_at' => $this->ago(3), 'updated_at' => $this->ago(1)]);   // updated later is fine
        $this->log(['created_at' => $this->ago(3), 'updated_at' => null]);            // a missing time is not judged
        $this->log(['created_at' => null, 'updated_at' => $this->ago(1)]);

        $this->refused(fn () => $this->log(['created_at' => $this->ago(1), 'updated_at' => $this->ago(2)]), 'Updated at cannot be before created at');
        $this->assertSame(4, DB::table('activity_logs')->count());

        $id = $this->log(['created_at' => $this->ago(5), 'updated_at' => $this->ago(4)]);
        // the add-only / written-once locks are lifted here so that only the order rule is being judged
        $this->withoutTimeLocks(function () use ($id) {
            $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['updated_at' => $this->ago(6)]), 'Updated at cannot be before created at');
            $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['created_at' => $this->ago(1)]), 'Updated at cannot be before created at');
            DB::table('activity_logs')->where('id', $id)->update(['updated_at' => $this->ago(2)]);
        });
        $this->assertSame($this->ago(2), DB::table('activity_logs')->where('id', $id)->value('updated_at'));
    }

    public function test_every_table_with_a_created_and_updated_time_is_covered(): void
    {
        $tables = collect(\Illuminate\Support\Facades\Schema::getTables())->pluck('name')->reject(fn ($t) => in_array($t, ['migrations', 'cache', 'cache_locks', 'sessions', 'jobs', 'job_batches', 'failed_jobs', 'password_reset_tokens', 'personal_access_tokens']))
            ->filter(fn ($t) => in_array('created_at', array_column(\Illuminate\Support\Facades\Schema::getColumns($t), 'name')) && in_array('updated_at', array_column(\Illuminate\Support\Facades\Schema::getColumns($t), 'name')));
        $this->assertGreaterThan(20, $tables->count());

        $triggers = collect(DB::select("select name from sqlite_master where type = 'trigger'"))->pluck('name');
        foreach ($tables as $table) {
            $this->assertTrue($triggers->contains("{$table}_updated_at_ord_insert"), "{$table} has no created/updated order rule");
        }
    }

    public function test_no_trigger_or_constraint_name_is_longer_than_mysql_allows(): void
    {
        $long = collect(DB::select("select name from sqlite_master where type in ('trigger', 'index')"))->pluck('name')->filter(fn ($n) => strlen($n) > 64)->values()->all();

        $this->assertSame([], $long, 'MySQL and MariaDB refuse names longer than 64 characters');
    }

    public function test_every_pair_has_its_own_name(): void
    {
        $names = collect(DB::select("select name from sqlite_master where type = 'trigger' and name like '%\_ord\_%' escape '\\'"))->pluck('name');

        $this->assertSame($names->count(), $names->unique()->count());
        $this->assertGreaterThan(40, $names->count());
    }

    // ---------- archive, reply, undo, use ----------

    public function test_an_archive_time_cannot_be_before_the_record_was_created(): void
    {
        $id = DB::table('event_expenses')->insertGetId([
            'event_id' => DB::table('events')->insertGetId(['name' => 'E', 'description' => 'x', 'location' => 'L', 'event_start' => now()->addDays(3)->toDateTimeString(), 'event_end' => now()->addDays(3)->addHours(2)->toDateTimeString()]),
            'item' => 'Food', 'amount' => 10, 'created_at' => $this->ago(2), 'updated_at' => $this->ago(2),
        ]);

        $this->refused(fn () => DB::table('event_expenses')->where('id', $id)->update(['deleted_at' => $this->ago(5), 'deleted_by' => 'PR-0001']), 'Deleted at cannot be before created at');
        DB::table('event_expenses')->where('id', $id)->update(['deleted_at' => $this->ago(1), 'deleted_by' => 'PR-0001']);
        $this->assertNotNull(DB::table('event_expenses')->where('id', $id)->value('deleted_at'));
    }

    public function test_replies_and_hearts_cannot_come_before_what_they_answer(): void
    {
        $id = $this->feedback(['created_at' => $this->ago(4), 'updated_at' => $this->ago(4)]);

        $this->refused(fn () => DB::table('feedback')->where('id', $id)->update(['staff_replied_at' => $this->ago(6)]), 'Staff replied at cannot be before created at');
        $this->refused(fn () => DB::table('feedback')->where('id', $id)->update(['staff_liked_at' => $this->ago(6)]), 'Staff liked at cannot be before created at');

        DB::table('feedback')->where('id', $id)->update(['staff_replied_at' => $this->ago(3), 'staff_reply' => 'Thanks']);
        $this->refused(fn () => DB::table('feedback')->where('id', $id)->update(['member_liked_reply_at' => $this->ago(3 + 1)]), 'Member liked reply at cannot be before staff replied at');
        DB::table('feedback')->where('id', $id)->update(['member_liked_reply_at' => $this->ago(2)]);
        $this->assertNotNull(DB::table('feedback')->where('id', $id)->value('member_liked_reply_at'));
    }

    public function test_a_transfer_expires_after_it_was_offered_and_a_recovery_code_is_used_after_it_was_made(): void
    {
        $from = $this->user();
        $to = $this->user();
        $offer = fn (string $created, string $expires) => DB::table('head_staff_transfers')->insert([
            'from_user_id' => $from, 'to_user_id' => $to, 'status' => 'cancelled', 'created_at' => $created, 'updated_at' => $created, 'expires_at' => $expires,
        ]);

        $offer($this->ago(1), now()->toDateTimeString());
        $this->refused(fn () => $offer($this->ago(1), $this->ago(2)), 'Expires at must be after created at');
        $this->refused(fn () => $offer($this->ago(1), $this->ago(1)), 'Expires at must be after created at');   // strictly after

        $code = fn (string $created, string $used) => DB::table('staff_recovery_codes')->insert(['user_id' => $from, 'code_hash' => 'x', 'created_at' => $created, 'updated_at' => $created, 'used_at' => $used]);
        $code($this->ago(3), $this->ago(2));
        $this->refused(fn () => $code($this->ago(3), $this->ago(4)), 'Used at cannot be before created at');
    }

    // ---------- judged only on change ----------

    public function test_an_older_row_with_times_out_of_order_never_blocks_an_unrelated_edit(): void
    {
        $m = $this->migration();
        $m->down();
        $id = $this->log(['created_at' => $this->ago(1), 'updated_at' => $this->ago(5)]);   // bad data from before the rules
        $m->up();                                                                           // the migration does not scan, so it cannot fail on it

        $this->withoutTimeLocks(function () use ($id) {   // the log is add-only, so the edit is made with that lock lifted
            DB::table('activity_logs')->where('id', $id)->update(['description' => 'edited']);
            $this->assertSame('edited', DB::table('activity_logs')->where('id', $id)->value('description'));

            DB::table('activity_logs')->where('id', $id)->update(['updated_at' => $this->ago(0)]);   // fixing it is welcome
        });
        $this->assertNotNull(DB::table('activity_logs')->where('id', $id)->value('updated_at'));
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->down();
        $this->log(['created_at' => $this->ago(1), 'updated_at' => $this->ago(2)]);   // accepted while unlocked
        $this->withoutTimeLocks(fn () => DB::table('activity_logs')->delete());
        $m->up();
        $m->up();

        $this->refused(fn () => $this->log(['created_at' => $this->ago(1), 'updated_at' => $this->ago(2)]), 'Updated at cannot be before created at');
    }
}

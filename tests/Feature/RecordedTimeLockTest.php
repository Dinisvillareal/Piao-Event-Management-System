<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Membership;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * Times that record when something happened cannot be rewritten (migration 2026_11_19_000018), and no
 * API endpoint lets a request write them: created_at is written once, updated_at only moves forward,
 * archive / sign-in / reply times cannot be re-dated, and the activity log (with its IP address) is add-only.
 */
class RecordedTimeLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private const PASSWORD = 'Passw0rd!Strong#1';

    private int $n = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000018_lock_recorded_times_and_activity_log.php');
    }

    private function refused(callable $write, string $why): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString($why, $e->getMessage(), 'refused, but not by the expected rule');

            return;
        }
        $this->fail("The database accepted the change ({$why})");
    }

    private function ago(int $hours): string
    {
        return now()->subHours($hours)->toDateTimeString();
    }

    private function item(array $extra = []): int
    {
        $this->n++;

        return DB::table('inventory_items')->insertGetId(array_merge(['name' => "Chair {$this->n}", 'quantity' => 1, 'good_quantity' => 1, 'created_at' => $this->ago(10), 'updated_at' => $this->ago(10)], $extra));
    }

    private function log(array $extra = []): int
    {
        return DB::table('activity_logs')->insertGetId(array_merge([
            'user_code' => 'PR-0001', 'action' => 'Test', 'module' => 'Events', 'description' => 'x', 'ip_address' => '10.0.0.7',
            'created_at' => $this->ago(3), 'updated_at' => $this->ago(3),
        ], $extra));
    }

    private function event(array $extra = []): int
    {
        $this->n++;

        return DB::table('events')->insertGetId(array_merge([
            'name' => "Fiesta {$this->n}", 'description' => 'x', 'location' => "Hall {$this->n}",
            'event_start' => now()->subDays(2)->setTime(9, 0)->toDateTimeString(), 'event_end' => now()->subDays(2)->setTime(12, 0)->toDateTimeString(),
        ], $extra));
    }

    // ---------- created_at: written once ----------

    public function test_created_at_is_written_once_and_cannot_be_changed_or_erased(): void
    {
        $id = $this->item();
        $row = fn () => DB::table('inventory_items')->where('id', $id);

        $this->refused(fn () => $row()->update(['created_at' => $this->ago(50)]), 'Created at cannot be changed');
        $this->refused(fn () => $row()->update(['created_at' => $this->ago(1)]), 'Created at cannot be changed');
        $this->refused(fn () => $row()->update(['created_at' => null]), 'Created at cannot be changed');
        $this->assertSame($this->ago(10), $row()->value('created_at'));

        $row()->update(['name' => 'Renamed', 'created_at' => $this->ago(10)]);   // saving the same value again is not a change
        $this->assertSame('Renamed', $row()->value('name'));
    }

    public function test_a_blank_created_at_from_an_old_record_may_be_filled_in_once(): void
    {
        $id = $this->item(['created_at' => null, 'updated_at' => null]);

        DB::table('inventory_items')->where('id', $id)->update(['created_at' => $this->ago(40)]);
        $this->refused(fn () => DB::table('inventory_items')->where('id', $id)->update(['created_at' => $this->ago(41)]), 'Created at cannot be changed');
    }

    // ---------- updated_at: forward only ----------

    public function test_updated_at_only_moves_forward_and_cannot_be_erased(): void
    {
        $id = $this->item();
        $row = fn () => DB::table('inventory_items')->where('id', $id);

        $this->refused(fn () => $row()->update(['updated_at' => $this->ago(11)]), 'Updated at cannot be moved back');
        $this->refused(fn () => $row()->update(['updated_at' => null]), 'Updated at cannot be moved back');
        $row()->update(['updated_at' => $this->ago(5)]);                    // forward is what every edit does
        $row()->update(['updated_at' => $this->ago(5), 'name' => 'Same second']);   // the same time is fine
        $this->assertSame($this->ago(5), $row()->value('updated_at'));
    }

    // ---------- archive / suspend / likes: set or clear, never re-dated ----------

    public function test_an_archive_time_can_be_set_and_cleared_but_not_re_dated(): void
    {
        $id = $this->item();
        $row = fn () => DB::table('inventory_items')->where('id', $id);

        $row()->update(['deleted_at' => $this->ago(4), 'deleted_by' => 'PR-0001']);
        $this->refused(fn () => $row()->update(['deleted_at' => $this->ago(99)]), 'Deleted at cannot be changed to a different time');
        $this->assertSame($this->ago(4), $row()->value('deleted_at'));

        $row()->update(['deleted_at' => null, 'deleted_by' => null]);       // a restore
        $row()->update(['deleted_at' => $this->ago(1), 'deleted_by' => 'PR-0001']);   // and a later archive carries the new, real time
        $this->assertSame($this->ago(1), $row()->value('deleted_at'));
    }

    public function test_the_app_can_archive_and_restore_a_membership_repeatedly(): void
    {
        $m = Membership::create(['name' => 'Senior Club', 'description' => 'x']);

        foreach (range(1, 3) as $_) {
            $m->archive('closed', 'PR-0001');
            $this->assertSoftDeleted('memberships', ['id' => $m->id]);
            Membership::withTrashed()->find($m->id)->unarchive();
            $this->assertNotSoftDeleted('memberships', ['id' => $m->id]);
        }
    }

    public function test_archiving_an_already_archived_membership_keeps_its_first_time(): void
    {
        $m = Membership::create(['name' => 'Youth Club', 'description' => 'x']);
        $m->archive('closed', 'PR-0001');
        $first = DB::table('memberships')->where('id', $m->id)->value('deactivated_at');

        Membership::withTrashed()->find($m->id)->forceFill(['is_active' => true])->save();
        Membership::withTrashed()->find($m->id)->update(['deactivated_at' => DB::table('memberships')->where('id', $m->id)->value('deactivated_at')]);

        $this->assertSame($first, DB::table('memberships')->where('id', $m->id)->value('deactivated_at'));
    }

    public function test_suspension_and_two_step_times_cannot_be_re_dated(): void
    {
        $u = $this->makeUser('Staff');
        $row = fn () => DB::table('users')->where('id', $u->id);

        $row()->update(['suspended_at' => $this->ago(8)]);
        $this->refused(fn () => $row()->update(['suspended_at' => $this->ago(1)]), 'Suspended at cannot be changed to a different time');
        $row()->update(['suspended_at' => null]);

        $row()->update(['two_factor_confirmed_at' => $this->ago(8)]);
        $this->refused(fn () => $row()->update(['two_factor_confirmed_at' => $this->ago(2)]), 'Two factor confirmed at cannot be changed');
        $row()->update(['two_factor_confirmed_at' => null]);
    }

    public function test_suspending_twice_through_the_app_keeps_the_first_suspension_time(): void
    {
        $head = $this->headStaff();
        $target = $this->staff();
        $first = $this->ago(3);
        DB::table('users')->where('id', $target->id)->update(['suspended_at' => $first]);   // already suspended earlier

        $this->actingAs($head)->postJson("/staff-accounts/{$target->id}/suspend", ['password' => self::PASSWORD])->assertOk();

        $this->assertSame($first, DB::table('users')->where('id', $target->id)->value('suspended_at'));
    }

    // ---------- sign-in, sign-out, undo, recovery: written once ----------

    public function test_sign_in_and_sign_out_times_are_written_once(): void
    {
        $event = $this->event();
        $user = $this->makeUser()->id;
        $a = DB::table('attendances')->insertGetId(['event_id' => $event, 'user_id' => $user, 'status' => 'Incomplete']);
        $row = fn () => DB::table('attendances')->where('id', $a);

        $row()->update(['time_in' => now()->subDays(2)->setTime(8, 30)->toDateTimeString()]);   // from empty
        $this->refused(fn () => $row()->update(['time_in' => now()->subDays(2)->setTime(8, 45)->toDateTimeString()]), 'Time in cannot be changed once it is saved');
        $this->refused(fn () => $row()->update(['time_in' => null]), 'Time in cannot be changed once it is saved');

        $row()->update(['time_out' => now()->subDays(2)->setTime(12, 30)->toDateTimeString(), 'status' => 'Complete']);
        $this->refused(fn () => $row()->update(['time_out' => now()->subDays(2)->setTime(12, 45)->toDateTimeString()]), 'Time out cannot be changed once it is saved');
    }

    // ---------- replies and logins: forward only ----------

    public function test_a_reply_time_and_a_last_login_cannot_be_moved_back(): void
    {
        $event = $this->event();
        $user = $this->makeUser();
        $f = DB::table('feedback')->insertGetId(['event_id' => $event, 'user_id' => $user->id, 'rating' => 4, 'created_at' => $this->ago(9), 'updated_at' => $this->ago(9), 'staff_replied_at' => $this->ago(6)]);

        $this->refused(fn () => DB::table('feedback')->where('id', $f)->update(['staff_replied_at' => $this->ago(7)]), 'Staff replied at cannot be moved back');
        DB::table('feedback')->where('id', $f)->update(['staff_replied_at' => $this->ago(2)]);      // an edited reply is a later time
        DB::table('feedback')->where('id', $f)->update(['staff_replied_at' => null]);               // a removed reply

        DB::table('users')->where('id', $user->id)->update(['last_login_at' => $this->ago(5)]);
        $this->refused(fn () => DB::table('users')->where('id', $user->id)->update(['last_login_at' => $this->ago(6)]), 'Last login at cannot be moved back or erased');
        $this->refused(fn () => DB::table('users')->where('id', $user->id)->update(['last_login_at' => null]), 'Last login at cannot be moved back or erased');
        DB::table('users')->where('id', $user->id)->update(['last_login_at' => $this->ago(1)]);
    }

    // ---------- the activity log: add-only ----------

    public function test_the_activity_log_can_be_added_to_but_never_changed_or_deleted(): void
    {
        $id = $this->log();

        $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['ip_address' => '6.6.6.6']), 'The activity log cannot be changed');
        $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['description' => 'edited']), 'The activity log cannot be changed');
        $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->update(['created_at' => $this->ago(100)]), 'cannot be changed');
        $this->refused(fn () => DB::table('activity_logs')->where('id', $id)->delete(), 'The activity log cannot be deleted');
        $this->refused(fn () => DB::table('activity_logs')->delete(), 'The activity log cannot be deleted');

        $row = DB::table('activity_logs')->where('id', $id)->first();
        $this->assertSame('10.0.0.7', $row->ip_address);
        $this->assertSame('x', $row->description);
        $this->log();   // adding is what the log is for
        $this->assertSame(2, DB::table('activity_logs')->count());
    }

    public function test_the_app_still_writes_the_log_with_the_callers_own_ip_address(): void
    {
        $staff = $this->staff();
        $this->actingAs($staff)->withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])->postJson('/users', [
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'contact_number' => '09171234567', 'role' => 'Resident', 'has_account' => true,
            'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD,
        ])->assertStatus(201);

        $this->assertSame('203.0.113.9', ActivityLog::latest('id')->value('ip_address'));
    }

    public function test_a_request_cannot_choose_the_ip_address_or_time_of_a_log_row(): void
    {
        $row = ActivityLog::create(['user_code' => 'PR-0001', 'action' => 'Test', 'module' => 'Events', 'description' => 'x',
            'ip_address' => '6.6.6.6', 'created_at' => '2020-01-01 00:00:00', 'updated_at' => '2020-01-01 00:00:00']);

        $this->assertNotSame('6.6.6.6', $row->fresh()->ip_address);
        $this->assertGreaterThan(2020, (int) $row->fresh()->created_at->format('Y'));
    }

    // ---------- API endpoints cannot write these columns ----------

    private const INJECT = [
        'created_at' => '2020-01-01 00:00:00', 'updated_at' => '2020-01-01 00:00:00', 'deleted_at' => '2020-01-01 00:00:00',
        'suspended_at' => '2020-01-01 00:00:00', 'last_login_at' => '2020-01-01 00:00:00', 'password_changed_at' => '2020-01-01 00:00:00',
        'two_factor_confirmed_at' => '2020-01-01 00:00:00', 'deactivated_at' => '2020-01-01 00:00:00', 'time_in' => '2020-01-01 00:00:00',
        'time_out' => '2020-01-01 00:00:00', 'staff_replied_at' => '2020-01-01 00:00:00', 'ip_address' => '6.6.6.6', 'last_login_ip' => '6.6.6.6',
    ];

    private function noTrace(array $row): void
    {
        foreach (self::INJECT as $column => $value) {
            if (array_key_exists($column, $row)) {
                $this->assertNotSame($value, $row[$column] === null ? null : (string) $row[$column], "{$column} was taken from the request");
                $this->assertStringNotContainsString('2020-01-01', (string) $row[$column], "{$column} was taken from the request");
            }
        }
    }

    public function test_registering_and_editing_a_resident_ignores_times_and_ips_in_the_request(): void
    {
        $staff = $this->staff();
        $this->actingAs($staff)->postJson('/users', self::INJECT + [
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'contact_number' => '09171234567', 'role' => 'Resident', 'has_account' => true,
            'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD,
        ])->assertStatus(201);

        $user = DB::table('users')->where('first_name', 'Juan')->first();
        $this->noTrace((array) $user);
        $this->assertNull($user->deleted_at);

        $before = (array) $user;
        $this->actingAs($staff)->putJson("/users/{$user->id}", self::INJECT + ['first_name' => 'Juana', 'last_name' => 'Dela Cruz', 'contact_number' => '09171234567']);
        $after = (array) DB::table('users')->where('id', $user->id)->first();
        $this->noTrace($after);
        foreach (['deleted_at', 'suspended_at', 'last_login_at', 'password_changed_at', 'two_factor_confirmed_at', 'last_login_ip'] as $c) {
            $this->assertSame($before[$c], $after[$c], "{$c} changed through the edit form");
        }
    }

    public function test_events_expenses_and_inventory_ignore_times_in_the_request(): void
    {
        $staff = $this->staff();
        $when = fn (int $h) => now()->addHours($h)->toDateTimeString();

        $event = $this->actingAs($staff)->postJson('/events', self::INJECT + [
            'name' => 'Clean-up', 'description' => 'Drive', 'location' => 'Plaza',
            'event_start' => $when(40), 'event_end' => $when(42), 'call_time_start' => $when(38), 'call_time_end' => $when(43),
        ])->assertStatus(201);
        $eventId = (int) ($event->json('id') ?? $event->json('event.id') ?? DB::table('events')->value('id'));
        $this->noTrace((array) DB::table('events')->where('id', $eventId)->first());

        $this->actingAs($staff)->putJson("/events/{$eventId}", self::INJECT + [
            'name' => 'Clean-up 2', 'description' => 'Drive', 'location' => 'Plaza',
            'event_start' => $when(40), 'event_end' => $when(42), 'call_time_start' => $when(38), 'call_time_end' => $when(43),
        ]);
        $this->assertNull(DB::table('events')->where('id', $eventId)->value('deleted_at'));

        $res = $this->actingAs($staff)->post("/events/{$eventId}/expenses", self::INJECT + ['item' => 'Tarp', 'amount' => 100, 'receipt' => $this->fakeImage('r.jpg')], ['Accept' => 'application/json'])->assertStatus(201);
        $expense = DB::table('event_expenses')->first();
        $this->noTrace((array) $expense);
        $createdAt = $expense->created_at;

        $this->actingAs($staff)->putJson("/events/{$eventId}/expenses/{$expense->id}", self::INJECT + ['item' => 'Tarp 2', 'amount' => 150]);
        $after = DB::table('event_expenses')->where('id', $expense->id)->first();
        $this->assertSame($createdAt, $after->created_at);
        $this->assertNull($after->deleted_at);

        $this->actingAs($staff)->post('/inventory', self::INJECT + ['name' => 'Chairs', 'quantity' => 0, 'new_quantity' => 5, 'good_quantity' => 1, 'fair_quantity' => 0, 'poor_quantity' => 0, 'photo' => $this->fakeImage('c.jpg')], ['Accept' => 'application/json'])->assertStatus(201);
        $item = DB::table('inventory_items')->first();
        $this->noTrace((array) $item);
        $this->actingAs($staff)->putJson("/inventory/{$item->id}", self::INJECT + ['name' => 'Chairs 2', 'quantity' => 6]);
        $this->assertSame($item->created_at, DB::table('inventory_items')->where('id', $item->id)->value('created_at'));
        $this->assertNull(DB::table('inventory_items')->where('id', $item->id)->value('deleted_at'));
    }

    public function test_a_staff_reply_ignores_times_in_the_request(): void
    {
        $staff = $this->staff();
        $event = $this->event();
        $f = DB::table('feedback')->insertGetId(['event_id' => $event, 'user_id' => $this->makeUser()->id, 'rating' => 5, 'created_at' => $this->ago(9), 'updated_at' => $this->ago(9)]);

        $this->actingAs($staff)->putJson("/feedback/rating/{$f}/reply", self::INJECT + ['reply' => 'Salamat po!'])->assertOk();

        $row = DB::table('feedback')->where('id', $f)->first();
        $this->assertSame($this->ago(9), $row->created_at);
        $this->assertStringNotContainsString('2020-01-01', (string) $row->staff_replied_at);
        $this->assertNotNull($row->staff_replied_at);
    }

    public function test_no_model_lets_a_request_fill_in_a_system_time_or_ip_address(): void
    {
        $forbidden = ['created_at', 'updated_at', 'deleted_at', 'ip_address', 'last_login_at', 'last_login_ip', 'suspended_at', 'password_changed_at', 'two_factor_confirmed_at', 'deactivated_at'];
        $checked = 0;

        foreach (glob(app_path('Models/*.php')) as $file) {
            $class = 'App\\Models\\' . basename($file, '.php');
            if (!is_subclass_of($class, \Illuminate\Database\Eloquent\Model::class)) {
                continue;
            }
            $model = new $class();
            $this->assertSame([], array_values(array_intersect($forbidden, $model->getFillable())), "{$class} lets a request fill a system time");
            $this->assertTrue($model->getFillable() !== [] || $model->getGuarded() !== [], "{$class} is left unguarded");
            $checked++;
        }

        $this->assertGreaterThan(20, $checked);
    }

    // ---------- the rules themselves ----------

    public function test_every_recorded_time_column_has_a_rule_and_no_planned_one_does(): void
    {
        $future = require database_path('migrations/2026_11_19_000014_lock_recorded_times_against_the_future.php');
        $m = $this->migration();

        $recorded = array_unique(array_merge(...array_values($future::RECORDED)));
        $planned = array_unique(array_merge(...array_values($future::PLANNED)));

        $this->assertSame([], array_values(array_diff($recorded, array_keys($m::MODES))), 'a recorded time has no rule');
        $this->assertSame([], array_values(array_intersect($planned, array_keys($m::MODES))), 'a time that plans something would be locked');
        $this->assertSame([], array_values(array_diff(array_keys($m::MODES), $recorded)), 'a rule is for a column that is not a recorded time');
    }

    public function test_every_table_with_a_governed_column_has_its_lock_and_the_names_fit_mysql(): void
    {
        $m = $this->migration();
        $triggers = collect(DB::select("select name from sqlite_master where type = 'trigger'"))->pluck('name');

        $targets = $m->targets();
        $this->assertGreaterThan(60, count($targets));
        foreach ($targets as [$table, $column]) {
            $this->assertTrue($triggers->contains($m->name($table, $column)), "{$table}.{$column} has no lock");
        }
        $this->assertTrue($triggers->contains('activity_logs_append_only_update'));
        $this->assertTrue($triggers->contains('activity_logs_append_only_delete'));

        $names = $m->names();
        $this->assertSame($names, array_values(array_unique($names)), 'two locks share a name');
        $pairs = array_map(fn ($t) => strtolower("{$t[0]}.{$t[1]}"), $targets);
        $this->assertSame($pairs, array_values(array_unique($pairs)), 'a column is locked twice');
        $this->assertSame([], array_values(array_filter($names, fn ($n) => strlen($n) > 64)), 'a name is longer than MySQL allows');
    }

    public function test_stored_history_never_blocks_the_migration_or_an_unrelated_edit(): void
    {
        $m = $this->migration();
        $m->down();
        $id = $this->item();
        DB::table('inventory_items')->where('id', $id)->update(['created_at' => $this->ago(70)]);   // re-dated before the lock existed
        $m->up();                                                                                 // the migration does not scan, so it cannot fail on it

        DB::table('inventory_items')->where('id', $id)->update(['name' => 'edited']);
        $this->assertSame('edited', DB::table('inventory_items')->where('id', $id)->value('name'));
    }

    public function test_the_lock_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $id = $this->item();

        $m->down();
        DB::table('inventory_items')->where('id', $id)->update(['created_at' => $this->ago(70)]);   // possible while unlocked
        DB::table('activity_logs')->delete();
        $m->up();
        $m->up();

        $this->refused(fn () => DB::table('inventory_items')->where('id', $id)->update(['created_at' => $this->ago(71)]), 'Created at cannot be changed');
    }
}

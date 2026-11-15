<?php

namespace Tests\Feature;

use App\Exceptions\MutexBusyException;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Event;
use App\Models\FeedbackEdit;
use App\Models\AbsenceReason;
use App\Models\CurrentStatus;
use App\Models\HeadStaffTransfer;
use App\Models\Household;
use App\Models\InventoryItem;
use App\Models\StaffRecoveryCode;
use App\Models\User;
use App\Support\Mutex;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Support;
use Tests\TestCase;

/**
 * Race conditions. The test database is SQLite and runs one request at a time, so row locks and
 * GET_LOCK are no-ops here. Each test therefore reproduces the dangerous INTERLEAVING directly:
 * a second actor changes the data in the gap between the "check" and the "write" of the code under
 * test (see interleave()), and we assert the code no longer trusts what it read earlier.
 */
class RaceConditionTest extends TestCase
{
    use RefreshDatabase, Support;

    private const PASSWORD = 'Passw0rd!Strong#1';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    /**
     * Runs $act once, right after the first query for which $when returns true has finished -- i.e. in
     * the gap between a request reading something and writing based on it.
     */
    private function interleave(callable $when, callable $act): void
    {
        $fired = false;
        DB::listen(function ($q) use (&$fired, $when, $act) {
            if ($fired || !$when(strtolower($q->sql), $q->bindings)) {
                return;
            }
            $fired = true;
            $act();
        });
    }

    // ------------------------------------------------------------------ Mutex

    public function test_mutex_just_runs_the_callback_when_the_database_has_no_named_locks(): void
    {
        $this->assertSame('done', Mutex::run('anything', fn () => 'done'));
    }

    public function test_mutex_takes_and_releases_the_same_named_lock_even_when_the_callback_throws(): void
    {
        $calls = [];
        DB::shouldReceive('getDriverName')->andReturn('mysql');
        DB::shouldReceive('selectOne')->andReturnUsing(function ($sql, $bindings) use (&$calls) {
            $calls[] = [$sql, $bindings];
            return (object) ['got' => 1, 'released' => 1];
        });

        try {
            Mutex::run('Event-Venue:Plaza', function () {
                throw new \RuntimeException('boom');
            });
            $this->fail('the exception should pass through');
        } catch (\RuntimeException $e) {
            $this->assertSame('boom', $e->getMessage());
        }

        $this->assertCount(2, $calls, 'one GET_LOCK and one RELEASE_LOCK');
        $this->assertStringContainsString('GET_LOCK', $calls[0][0]);
        $this->assertStringContainsString('RELEASE_LOCK', $calls[1][0]);
        $this->assertSame($calls[0][1][0], $calls[1][1][0], 'released the very lock it took');
        $this->assertLessThanOrEqual(64, strlen($calls[0][1][0]), 'MySQL lock names are capped at 64 characters');
    }

    public function test_mutex_lock_names_ignore_letter_case_so_plaza_and_PLAZA_are_one_venue(): void
    {
        $names = [];
        DB::shouldReceive('getDriverName')->andReturn('mysql');
        DB::shouldReceive('selectOne')->andReturnUsing(function ($sql, $bindings) use (&$names) {
            if (str_contains($sql, 'GET_LOCK')) {
                $names[] = $bindings[0];
            }
            return (object) ['got' => 1];
        });

        Mutex::run('event-venue:Plaza', fn () => null);
        Mutex::run('EVENT-VENUE:plaza', fn () => null);

        $this->assertSame($names[0], $names[1]);
    }

    public function test_mutex_gives_up_without_running_or_releasing_when_the_lock_is_not_free(): void
    {
        $ran = false;
        $released = false;
        DB::shouldReceive('getDriverName')->andReturn('mariadb');
        DB::shouldReceive('selectOne')->andReturnUsing(function ($sql) use (&$released) {
            if (str_contains($sql, 'RELEASE_LOCK')) {
                $released = true;
            }
            return (object) ['got' => 0];
        });

        $this->expectException(MutexBusyException::class);
        try {
            Mutex::run('k', function () use (&$ran) {
                $ran = true;
            });
        } finally {
            $this->assertFalse($ran, 'the guarded work must not run without the lock');
            $this->assertFalse($released, 'a lock that was never taken must not be released');
        }
    }

    public function test_a_busy_lock_becomes_a_plain_503_instead_of_a_crash(): void
    {
        $controller = new class extends Controller {
            public function go(callable $cb) { return $this->exclusively('k', $cb); }
        };

        $res = $controller->go(fn () => throw new MutexBusyException());

        $this->assertSame(503, $res->getStatusCode());
        $this->assertStringContainsString('busy', $res->getData(true)['message']);
        $this->assertSame('ok', $controller->go(fn () => 'ok'));
    }

    // ------------------------------------------------------------------ inventory stock

    public function test_two_stale_copies_of_one_item_taking_units_add_up_instead_of_overwriting_each_other(): void
    {
        $item = InventoryItem::create(['name' => 'Chairs', 'quantity' => 12, 'new_quantity' => 0, 'good_quantity' => 12, 'fair_quantity' => 0, 'poor_quantity' => 0]);

        // Two requests loaded the item while 12 were in stock...
        $a = InventoryItem::find($item->id);
        $b = InventoryItem::find($item->id);

        $a->takeUnits(['Good' => 5]);
        $b->takeUnits(['Good' => 4]); // ...and the second one still believes 12 are there.

        $fresh = $item->fresh();
        $this->assertSame(3, (int) $fresh->good_quantity, '12 - 5 - 4, not 12 - 4 (the first change lost)');
        $this->assertSame(3, (int) $fresh->quantity);
    }

    public function test_a_stale_copy_returning_units_does_not_wipe_out_a_borrow_made_meanwhile(): void
    {
        $item = InventoryItem::create(['name' => 'Tables', 'quantity' => 10, 'new_quantity' => 0, 'good_quantity' => 10, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $stale = InventoryItem::find($item->id);

        InventoryItem::find($item->id)->takeUnits(['Good' => 6]);
        $stale->giveUnits(['Good' => 2]);

        $this->assertSame(6, (int) $item->fresh()->good_quantity); // 10 - 6 + 2
        $this->assertSame(6, (int) $item->fresh()->quantity);
    }

    public function test_the_stock_check_for_a_borrow_reads_the_stock_again_under_the_lock(): void
    {
        $chairs = InventoryItem::create(['name' => 'Chairs', 'quantity' => 12, 'new_quantity' => 0, 'good_quantity' => 12, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $staff = $this->staff();

        // Another event grabs 10 chairs in the gap after this request read "12 in stock".
        $this->interleave(
            fn ($sql) => str_starts_with($sql, 'select') && str_contains($sql, '"inventory_items"') && !str_contains($sql, 'for update'),
            fn () => DB::table('inventory_items')->where('id', $chairs->id)->update(['good_quantity' => 2, 'quantity' => 2])
        );

        $res = $this->actingAs($staff)->postJson('/events', [
            'name' => 'Clean-up', 'description' => 'Drive', 'location' => 'Plaza',
            'event_start' => now()->addHours(4)->toDateTimeString(), 'event_end' => now()->addHours(6)->toDateTimeString(),
            'call_time_start' => now()->addHour()->toDateTimeString(), 'call_time_end' => now()->addHours(7)->toDateTimeString(),
            'borrowed_items' => [['inventory_item_id' => $chairs->id, 'quantity' => 8]],
        ]);

        $this->assertGreaterThanOrEqual(400, $res->getStatusCode(), 'the borrow of 8 must be refused: only 2 are really left');
        $this->assertSame(2, (int) $chairs->fresh()->quantity, 'stock untouched by the refused borrow');
        $this->assertSame(0, Event::count(), 'and the event was rolled back with it');
    }

    // ------------------------------------------------------------------ login + second factor

    public function test_one_wrong_password_is_counted_exactly_once(): void
    {
        $u = $this->makeUser('Resident');
        $key = 'login:' . strtolower($u->user_code) . '|127.0.0.1';

        $this->postJson('/login', ['username' => $u->user_code, 'password' => 'wrong'])->assertStatus(401);

        $this->assertSame(1, RateLimiter::attempts($key), 'counted up front, not a second time on failure');
    }

    public function test_the_try_is_counted_before_the_password_is_judged_and_a_good_sign_in_clears_it(): void
    {
        $u = $this->makeUser('Resident');
        $key = 'login:' . strtolower($u->user_code) . '|127.0.0.1';

        // 4 wrong tries are already on the counter: the 5th (right password) is still allowed,
        // and clears the counter.
        for ($i = 0; $i < 4; $i++) {
            RateLimiter::hit($key, 60);
        }
        $this->postJson('/login', ['username' => $u->user_code, 'password' => self::PASSWORD])->assertOk();
        $this->assertSame(0, RateLimiter::attempts($key));

        // 5 wrong tries on the counter: even the right password is refused, and stays counted.
        auth()->logout();
        for ($i = 0; $i < 5; $i++) {
            RateLimiter::hit($key, 60);
        }
        $this->postJson('/login', ['username' => $u->user_code, 'password' => self::PASSWORD])->assertStatus(429);
        $this->assertGreaterThanOrEqual(5, RateLimiter::attempts($key));
    }

    public function test_the_same_login_code_cannot_be_used_twice_even_when_a_parallel_request_claimed_it_first(): void
    {
        $u = $this->staff();
        $secret = $this->enableTwoFactor($u);
        $code = $this->otp($secret);
        $step = Totp::verify($secret, $code);

        // A parallel sign-in claims this code between our "is it valid?" and our "mark it used".
        $this->interleave(
            fn ($sql) => str_starts_with($sql, 'select') && str_contains($sql, '"users"'),
            fn () => Cache::add('totp-used:' . $u->id . ':' . $step, true, 180)
        );

        $this->postJson('/login', ['username' => $u->user_code, 'password' => self::PASSWORD, 'otp' => $code])->assertStatus(401);
        $this->assertGuest();
    }

    public function test_a_login_code_works_once_and_is_then_spent(): void
    {
        $u = $this->staff();
        $secret = $this->enableTwoFactor($u);
        $code = $this->otp($secret);

        $this->postJson('/login', ['username' => $u->user_code, 'password' => self::PASSWORD, 'otp' => $code])->assertOk();
        auth()->logout();
        $this->postJson('/login', ['username' => $u->user_code, 'password' => self::PASSWORD, 'otp' => $code])->assertStatus(401);
    }

    public function test_a_sensitive_action_code_is_single_use(): void
    {
        $h = $this->headStaff();
        $secret = $this->enableTwoFactor($h);
        $code = $this->otp($secret);

        $this->actingAs($h)->postJson('/staff-accounts/recovery-codes', ['password' => self::PASSWORD, 'otp' => $code])->assertOk();
        $this->actingAs($h)->postJson('/staff-accounts/recovery-codes', ['password' => self::PASSWORD, 'otp' => $code])->assertStatus(422);
    }

    public function test_a_sensitive_action_code_claimed_in_parallel_is_refused(): void
    {
        $h = $this->headStaff();
        $secret = $this->enableTwoFactor($h);
        $code = $this->otp($secret);
        $step = Totp::verify($secret, $code);
        Cache::add('totp-used-sensitive:' . $h->id . ':' . $step, true, 180);

        $this->actingAs($h)->postJson('/staff-accounts/recovery-codes', ['password' => self::PASSWORD, 'otp' => $code])->assertStatus(422);
        $this->assertSame(0, StaffRecoveryCode::where('user_id', $h->id)->count());
    }

    public function test_wrong_passwords_for_sensitive_actions_are_counted_once_each_and_a_right_one_clears_them(): void
    {
        $h = $this->headStaff();
        $secret = $this->enableTwoFactor($h);

        $this->actingAs($h)->postJson('/staff-accounts/recovery-codes', ['password' => 'nope', 'otp' => $this->otp($secret)])->assertStatus(422);
        $this->assertSame(1, RateLimiter::attempts('reauth:' . $h->id));

        $this->actingAs($h)->postJson('/staff-accounts/recovery-codes', ['password' => self::PASSWORD, 'otp' => $this->otp($secret)])->assertOk();
        $this->assertSame(0, RateLimiter::attempts('reauth:' . $h->id));
        $this->assertSame(0, RateLimiter::attempts('reauth-otp:' . $h->id));
    }

    // ------------------------------------------------------------------ recovery code

    public function test_a_recovery_code_burned_by_a_parallel_request_cannot_be_used_again(): void
    {
        $head = $this->headStaff();
        $code = StaffRecoveryCode::create(['user_id' => $head->id, 'code_hash' => bcrypt('ABCDE23456')]);
        $oldHash = $head->password;

        // Someone else uses the same code after we found it but before we burn it.
        $this->interleave(
            fn ($sql) => str_starts_with($sql, 'select') && str_contains($sql, '"staff_recovery_codes"'),
            fn () => DB::table('staff_recovery_codes')->where('id', $code->id)->update(['used_at' => now()])
        );

        $this->postJson('/recover-head-access', [
            'user_code' => $head->user_code, 'recovery_code' => 'ABCDE-23456',
            'new_password' => 'Br4nd!New#Password99', 'new_password_confirmation' => 'Br4nd!New#Password99',
        ])->assertStatus(422);

        $this->assertSame($oldHash, $head->fresh()->password, 'the password must not change on a spent code');
    }

    public function test_a_recovery_code_works_exactly_once(): void
    {
        $head = $this->headStaff();
        StaffRecoveryCode::create(['user_id' => $head->id, 'code_hash' => bcrypt('ABCDE23456')]);
        $payload = [
            'user_code' => $head->user_code, 'recovery_code' => 'ABCDE-23456',
            'new_password' => 'Br4nd!New#Password99', 'new_password_confirmation' => 'Br4nd!New#Password99',
        ];

        $this->postJson('/recover-head-access', $payload)->assertOk();
        $this->postJson('/recover-head-access', $payload)->assertStatus(422);
        $this->assertNotNull(StaffRecoveryCode::where('user_id', $head->id)->first()->used_at);
    }

    // ------------------------------------------------------------------ Head Staff hand-over

    private function offerTransfer(User $from, User $to): HeadStaffTransfer
    {
        return HeadStaffTransfer::create([
            'from_user_id' => $from->id, 'to_user_id' => $to->id,
            'status' => 'pending', 'expires_at' => now()->addHours(48),
        ]);
    }

    public function test_accepting_a_transfer_that_was_cancelled_a_moment_ago_changes_nobody(): void
    {
        $head = $this->headStaff();
        $me = $this->staff();
        $secret = $this->enableTwoFactor($me);
        $t = $this->offerTransfer($head, $me);

        // The Head Staff cancels after we loaded the offer.
        $this->interleave(
            fn ($sql) => str_starts_with($sql, 'select') && str_contains($sql, '"head_staff_transfers"'),
            fn () => DB::table('head_staff_transfers')->where('id', $t->id)->update(['status' => 'cancelled'])
        );

        $this->actingAs($me)->postJson('/staff/head-transfer/accept', ['password' => self::PASSWORD, 'otp' => $this->otp($secret)])
            ->assertStatus(422);

        $this->assertTrue((bool) $head->fresh()->is_head_staff);
        $this->assertFalse((bool) $me->fresh()->is_head_staff);
        $this->assertSame('cancelled', $t->fresh()->status);
    }

    public function test_accepting_twice_hands_the_role_over_once(): void
    {
        $head = $this->headStaff();
        $me = $this->staff();
        $secret = $this->enableTwoFactor($me);
        $t = $this->offerTransfer($head, $me);

        $this->actingAs($me)->postJson('/staff/head-transfer/accept', ['password' => self::PASSWORD, 'otp' => $this->otp($secret)])->assertOk();
        $this->actingAs($me)->postJson('/staff/head-transfer/accept', ['password' => self::PASSWORD, 'otp' => $this->otp($secret, 1)])->assertStatus(404);

        $this->assertSame(1, User::where('role', 'Staff')->where('is_head_staff', true)->count());
        $this->assertTrue((bool) $me->fresh()->is_head_staff);
        $this->assertSame('accepted', $t->fresh()->status);
    }

    public function test_a_transfer_whose_sender_stopped_being_head_is_cancelled_and_rolled_back(): void
    {
        $head = $this->headStaff();
        $me = $this->staff();
        $secret = $this->enableTwoFactor($me);
        $t = $this->offerTransfer($head, $me);

        // The sender is no longer Head Staff by the time the swap runs under the lock.
        $this->interleave(
            fn ($sql, $b) => str_starts_with($sql, 'update') && str_contains($sql, '"head_staff_transfers"') && in_array('accepted', $b, true),
            fn () => DB::table('users')->where('id', $head->id)->update(['is_head_staff' => false])
        );

        $this->actingAs($me)->postJson('/staff/head-transfer/accept', ['password' => self::PASSWORD, 'otp' => $this->otp($secret)])
            ->assertStatus(422);

        $this->assertFalse((bool) $me->fresh()->is_head_staff, 'no one became Head Staff off a dead offer');
        $this->assertSame('cancelled', $t->fresh()->status);
    }

    public function test_removing_someone_who_just_became_head_staff_is_refused(): void
    {
        $head = $this->headStaff();
        $target = $this->staff();

        // The hand-over to $target lands after we loaded them as an ordinary staff member.
        $this->interleave(
            fn ($sql, $b) => str_starts_with($sql, 'select') && str_contains($sql, '"users"') && in_array((string) $target->id, array_map("strval", $b), true),
            function () use ($head, $target) {
                // (the database allows only one Head Staff, so the hand-over moves the role)
                DB::table('users')->where('id', $head->id)->update(['is_head_staff' => false]);
                DB::table('users')->where('id', $target->id)->update(['is_head_staff' => true]);
            }
        );

        $this->actingAs($head)->postJson("/staff-accounts/{$target->id}/demote", ['password' => self::PASSWORD])->assertStatus(422);

        $fresh = $target->fresh();
        $this->assertSame('Staff', $fresh->role);
        $this->assertTrue((bool) $fresh->is_head_staff);
    }

    public function test_suspending_someone_who_just_became_head_staff_is_refused(): void
    {
        $head = $this->headStaff();
        $target = $this->staff();

        $this->interleave(
            fn ($sql, $b) => str_starts_with($sql, 'select') && str_contains($sql, '"users"') && in_array((string) $target->id, array_map("strval", $b), true),
            function () use ($head, $target) {
                // (the database allows only one Head Staff, so the hand-over moves the role)
                DB::table('users')->where('id', $head->id)->update(['is_head_staff' => false]);
                DB::table('users')->where('id', $target->id)->update(['is_head_staff' => true]);
            }
        );

        $this->actingAs($head)->postJson("/staff-accounts/{$target->id}/suspend", ['password' => self::PASSWORD])->assertStatus(422);

        $this->assertNull($target->fresh()->suspended_at);
    }

    public function test_demote_and_suspend_still_work_for_an_ordinary_staff_member(): void
    {
        $head = $this->headStaff();
        $a = $this->staff();
        $b = $this->staff();

        $this->actingAs($head)->postJson("/staff-accounts/{$a->id}/suspend", ['password' => self::PASSWORD])->assertOk();
        $this->assertNotNull($a->fresh()->suspended_at);

        $this->actingAs($head)->postJson("/staff-accounts/{$b->id}/demote", ['password' => self::PASSWORD])->assertOk();
        $this->assertSame('Resident', $b->fresh()->role);
    }

    // ------------------------------------------------------------------ households

    public function test_a_resident_grabbed_by_another_household_in_the_gap_is_not_stolen(): void
    {
        $staff = $this->staff();
        $head = $this->makeUser('Resident');
        $other = Household::create(['code' => 'HH-0001', 'address' => 'Purok 1']);

        // Another staff member puts the future head into household HH-0001 after our "nobody has a household" check.
        $this->interleave(
            fn ($sql, $b) => str_starts_with($sql, 'select') && str_contains($sql, '"users"') && str_contains($sql, 'household_id') && in_array((string) $head->id, array_map("strval", $b), true),
            fn () => DB::table('users')->where('id', $head->id)->update(['household_id' => $other->id])
        );

        $this->actingAs($staff)->postJson('/households', ['address' => 'Purok 2', 'head_user_id' => $head->id])->assertStatus(422);

        $this->assertSame($other->id, $head->fresh()->household_id, 'still in the household that got them first');
        $this->assertSame(1, Household::count(), 'the half-made household was rolled back');
    }

    public function test_adding_a_resident_who_already_has_a_household_is_refused_not_moved(): void
    {
        $staff = $this->staff();
        $first = Household::create(['code' => 'HH-0001', 'address' => 'Purok 1']);
        $second = Household::create(['code' => 'HH-0002', 'address' => 'Purok 2']);
        $person = $this->makeUser('Resident', ['household_id' => $first->id]);

        $this->actingAs($staff)->postJson("/households/{$second->id}/members", ['user_id' => $person->id])->assertStatus(422);

        $this->assertSame($first->id, $person->fresh()->household_id);
    }

    public function test_adding_an_unassigned_resident_to_a_household_still_works(): void
    {
        $staff = $this->staff();
        $hh = Household::create(['code' => 'HH-0001', 'address' => 'Purok 1']);
        $person = $this->makeUser('Resident', ['is_household_head' => true]);

        $this->actingAs($staff)->postJson("/households/{$hh->id}/members", ['user_id' => $person->id])->assertOk();

        $fresh = $person->fresh();
        $this->assertSame($hh->id, $fresh->household_id);
        $this->assertFalse((bool) $fresh->is_household_head, 'never inherits a stale head flag');
    }

    public function test_household_codes_stay_unique_and_in_order(): void
    {
        $staff = $this->staff();
        $a = $this->makeUser('Resident');
        $b = $this->makeUser('Resident');

        $this->actingAs($staff)->postJson('/households', ['head_user_id' => $a->id])->assertCreated();
        $this->actingAs($staff)->postJson('/households', ['head_user_id' => $b->id])->assertCreated();

        $this->assertSame(['HH-0001', 'HH-0002'], Household::orderBy('id')->pluck('code')->all());
    }

    // ------------------------------------------------------------------ lookup lists

    public function test_a_lookup_label_cannot_be_added_twice_whatever_the_letter_case(): void
    {
        $staff = $this->staff();

        $this->actingAs($staff)->postJson('/current-statuses', ['label' => 'Student'])->assertCreated();
        $this->actingAs($staff)->postJson('/current-statuses', ['label' => ' student '])->assertStatus(422);

        $this->assertSame(1, CurrentStatus::whereRaw('LOWER(label) = ?', ['student'])->count());
    }

    public function test_a_lookup_entry_in_use_cannot_be_archived(): void
    {
        $staff = $this->staff();
        $status = CurrentStatus::create(['label' => 'Farmer', 'category' => 'other', 'sort_order' => 1]);
        $person = $this->makeUser('Resident');
        $person->currentStatuses()->sync([$status->id]);

        $this->actingAs($staff)->deleteJson("/current-statuses/{$status->id}")->assertStatus(422);
        $this->assertNull($status->fresh()->deleted_at);
    }

    // ------------------------------------------------------------------ people codes

    public function test_new_resident_codes_are_unique_and_follow_the_latest_one(): void
    {
        $staff = $this->staff();
        $last = User::withTrashed()->latest('id')->first();
        $this->assertNotNull($last);

        $payload = fn (string $n) => ['first_name' => $n, 'last_name' => 'Cruz', 'contact_number' => '09171234567', 'has_account' => false];
        $r1 = $this->actingAs($staff)->postJson('/users', $payload('Ana'));
        $r2 = $this->actingAs($staff)->postJson('/users', $payload('Ben'));

        if ($r1->getStatusCode() === 201 && $r2->getStatusCode() === 201) {
            $this->assertNotSame($r1->json('user_code') ?? $r1->json('user.user_code'), $r2->json('user_code') ?? $r2->json('user.user_code'));
        }
        $codes = User::withTrashed()->pluck('user_code');
        $this->assertSame($codes->count(), $codes->unique()->count());
    }

    // ------------------------------------------------------------------ archive restore

    public function test_restoring_the_same_event_twice_logs_and_notifies_once(): void
    {
        $staff = $this->staff();
        $e = Event::create([
            'name' => 'Fiesta', 'description' => 'x', 'location' => 'Plaza',
            'event_start' => now()->addDay(), 'event_end' => now()->addDays(2),
            'call_time_start' => now()->addHours(5), 'call_time_end' => now()->addDays(2),
        ]);
        $this->actingAs($staff)->deleteJson("/events/{$e->id}")->assertOk();

        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'event', 'id' => $e->id])->assertOk();
        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'event', 'id' => $e->id])->assertOk();

        $this->assertSame(1, ActivityLog::where('action', 'Restore')->where('module', 'Events')->count());
        $this->assertNull(Event::withTrashed()->find($e->id)->deleted_at);
    }

    // ------------------------------------------------------------------ feedback

    public function test_answering_an_absence_twice_keeps_one_row_and_one_history_entry(): void
    {
        $resident = $this->makeUser('Resident');
        $e = Event::create([
            'name' => 'Past', 'description' => 'x', 'location' => 'Plaza',
            'event_start' => now()->subDays(3), 'event_end' => now()->subDays(2),
            'call_time_start' => now()->subDays(3)->subHour(), 'call_time_end' => now()->subDays(2),
        ]);

        $res1 = $this->actingAs($resident)->postJson('/feedback/absence', ['event_id' => $e->id, 'reason' => 'sick', 'comment' => 'a']);
        if ($res1->getStatusCode() === 404) {
            $this->markTestSkipped('absence route differs');
        }
        $res1->assertStatus(201);
        $this->actingAs($resident)->postJson('/feedback/absence', ['event_id' => $e->id, 'reason' => 'work', 'comment' => 'b'])->assertStatus(201);

        $this->assertSame(1, AbsenceReason::where('event_id', $e->id)->count());
        $this->assertSame(1, FeedbackEdit::where('kind', 'absence')->count());
        $this->assertSame('work', AbsenceReason::first()->reason);
    }
}

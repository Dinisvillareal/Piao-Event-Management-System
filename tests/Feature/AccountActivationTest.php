<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\Support;
use Tests\TestCase;

/**
 * Staff never type or see a resident's password. A portal account starts without one: the system prints a
 * one-time activation slip, and the resident uses its code (with the user code) to choose a password.
 */
class AccountActivationTest extends TestCase
{
    use RefreshDatabase, Support;

    private const PASSWORD = 'Passw0rd!Strong#1';

    /** Registers a resident with portal access and returns [user, slip]. */
    private function register(string $name = 'Juan'): array
    {
        $res = $this->actingAs($this->staff())->postJson('/users', [
            'first_name' => $name, 'last_name' => 'Dela Cruz', 'contact_number' => '09171234567', 'role' => 'Resident',
            'has_account' => true, 'birth_date' => '1990-05-05',
        ])->assertStatus(201);

        return [User::where('first_name', $name)->first(), $res->json('activation_slip')];
    }

    private function activate(User $u, string $code, array $extra = [])
    {
        auth()->logout();
        return $this->postJson('/activate-account', array_merge([
            'user_code' => $u->user_code, 'activation_code' => $code,
            'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD,
        ], $extra));
    }

    public function test_staff_register_the_account_without_any_password_and_get_a_slip_once(): void
    {
        [$user, $slip] = $this->register();

        $this->assertNull($user->password);
        $this->assertTrue($user->pending_activation);
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/', $slip['code']);
        $this->assertSame($user->user_code, $slip['user_code']);
        $this->assertNotSame($slip['code'], $user->activation_code_hash);   // only a hash is kept
        $this->assertDatabaseHas('activity_logs', ['action' => 'Activation Slip']);
        $this->assertArrayNotHasKey('activation_code_hash', $user->toArray());
    }

    public function test_a_portal_account_does_not_need_a_birth_date(): void
    {
        $this->actingAs($this->staff())->postJson('/users', [
            'first_name' => 'Ana', 'last_name' => 'Reyes', 'contact_number' => '09171234567', 'role' => 'Resident', 'has_account' => true,
        ])->assertStatus(201)->assertJsonStructure(['activation_slip' => ['user_code', 'code', 'expires_at']]);
    }

    public function test_a_waiting_account_cannot_sign_in_and_is_told_why(): void
    {
        [$user] = $this->register();
        auth()->logout();
        $this->postJson('/login', ['username' => $user->user_code, 'password' => 'anything'])
            ->assertStatus(401)->assertJson(['code' => 'pending_activation']);
    }

    public function test_the_resident_activates_with_the_code_and_then_signs_in_once(): void
    {
        [$user, $slip] = $this->register();

        $this->activate($user, $slip['code'])->assertOk();
        $user->refresh();
        $this->assertTrue(Hash::check(self::PASSWORD, $user->password));
        $this->assertFalse((bool) $user->must_change_password);
        $this->assertNull($user->activation_code_hash);
        $this->assertDatabaseHas('activity_logs', ['action' => 'Account Activated', 'user_code' => $user->user_code]);

        $this->postJson('/login', ['username' => $user->user_code, 'password' => self::PASSWORD])->assertOk();

        $this->activate($user, $slip['code'])->assertStatus(422);   // the code works only once
    }

    public function test_the_code_is_read_without_dashes_or_case(): void
    {
        [$user, $slip] = $this->register();
        $this->activate($user, strtolower(str_replace('-', ' ', $slip['code'])))->assertOk();
    }

    public function test_a_wrong_code_or_user_gets_the_same_answer_and_changes_nothing(): void
    {
        [$user, $slip] = $this->register();

        $a = $this->activate($user, 'ZZZZ-YYYY-XXXX')->assertStatus(422)->json('message');
        $b = $this->activate($user, 'AAAA-BBBB-CCCC')->assertStatus(422)->json('message');
        $c = $this->postJson('/activate-account', [
            'user_code' => 'PR-9999', 'activation_code' => 'AAAA-BBBB-CCCC',
            'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD,
        ])->assertStatus(422)->json('message');

        $this->assertSame($a, $b);
        $this->assertSame($a, $c);
        $this->assertNull($user->fresh()->password);
    }

    public function test_staff_can_give_a_registered_resident_a_portal_account_in_one_step(): void
    {
        $staff = $this->staff();
        $this->actingAs($staff)->postJson('/users', [
            'first_name' => 'Rosa', 'last_name' => 'Lim', 'contact_number' => '09171234567', 'role' => 'Resident', 'has_account' => false,
        ])->assertStatus(201);
        $rosa = User::where('first_name', 'Rosa')->first();
        $this->assertFalse((bool) $rosa->has_account);

        $res = $this->actingAs($staff)->postJson("/users/{$rosa->id}/portal-account")
            ->assertOk()->assertJsonStructure(['activation_slip' => ['user_code', 'name', 'code', 'expires_at', 'issued_by']]);
        $fresh = $rosa->fresh();
        $this->assertTrue((bool) $fresh->has_account);
        $this->assertNull($fresh->password);
        $this->assertTrue((bool) $fresh->pending_activation);
        $this->assertDatabaseHas('activity_logs', ['action' => 'Account Created']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'Activation Slip']);

        // not twice, and the slip works
        $this->actingAs($staff)->postJson("/users/{$rosa->id}/portal-account")->assertStatus(422);
        $this->activate($rosa, $res->json('activation_slip.code'))->assertOk();
    }

    public function test_the_one_step_account_is_staff_only_and_never_for_staff_accounts(): void
    {
        $staff = $this->staff();
        $other = $this->staff();
        $this->actingAs($staff)->postJson("/users/{$other->id}/portal-account")->assertStatus(403);
        $this->actingAs($this->makeUser('Resident'))->postJson("/users/{$staff->id}/portal-account")->assertStatus(403);
    }

    public function test_the_check_step_verifies_the_slip_and_changes_nothing(): void
    {
        [$user, $slip] = $this->register();
        auth()->logout();

        $this->postJson('/activate-account/check', ['user_code' => $user->user_code, 'activation_code' => $slip['code']])
            ->assertOk()->assertJson(['ok' => true]);

        $fresh = $user->fresh();
        $this->assertNull($fresh->password);            // still waiting: only the final step sets the password
        $this->assertTrue($fresh->pending_activation);
        $this->assertSame(0, (int) $fresh->activation_failed_attempts);

        // and the final step still works afterwards
        $this->activate($user, $slip['code'])->assertOk();
        $this->assertNotNull($user->fresh()->password);
    }

    public function test_the_check_step_gives_the_same_answer_for_any_mismatch_and_counts_wrong_tries(): void
    {
        [$user, $slip] = $this->register();
        auth()->logout();

        $wrong = $this->postJson('/activate-account/check', ['user_code' => $user->user_code, 'activation_code' => 'AAAA-BBBB-CCCC'])
            ->assertStatus(422)->assertJson(['code' => 'activation_failed'])->json('message');
        $none = $this->postJson('/activate-account/check', ['user_code' => 'PR-9999', 'activation_code' => 'AAAA-BBBB-CCCC'])
            ->assertStatus(422)->json('message');
        $this->assertSame($wrong, $none);
        $this->assertSame(1, (int) $user->fresh()->activation_failed_attempts);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/activate-account/check', ['user_code' => $user->user_code, 'activation_code' => 'AAAA-BBBB-CCCC']);
        }
        // five wrong tries through the check step cancel the real code too
        $this->postJson('/activate-account/check', ['user_code' => $user->user_code, 'activation_code' => $slip['code']])->assertStatus(422);
        $this->assertDatabaseHas('activity_logs', ['action' => 'Activation Cancelled']);
    }

    public function test_five_wrong_tries_cancel_the_code(): void
    {
        [$user, $slip] = $this->register();

        for ($i = 0; $i < 5; $i++) {
            $this->activate($user, 'AAAA-BBBB-CCCC')->assertStatus(422);
        }

        $this->assertNull($user->fresh()->activation_code_hash);
        $this->activate($user, $slip['code'])->assertStatus(422);   // even the right code no longer works
        $this->assertDatabaseHas('activity_logs', ['action' => 'Activation Cancelled']);
    }

    public function test_an_expired_code_does_not_work(): void
    {
        [$user, $slip] = $this->register();
        DB::table('users')->where('id', $user->id)->update(['activation_expires_at' => now()->subMinute()->toDateTimeString()]);

        $this->activate($user, $slip['code'])->assertStatus(422);
    }

    public function test_the_chosen_password_must_be_strong_and_confirmed(): void
    {
        [$user, $slip] = $this->register();

        $this->activate($user, $slip['code'], ['password' => 'weak', 'password_confirmation' => 'weak'])->assertStatus(422)->assertJsonValidationErrors('password');
        $this->activate($user, $slip['code'], ['password_confirmation' => 'Different#Pass9'])->assertStatus(422)->assertJsonValidationErrors('password');
        $this->assertNull($user->fresh()->password);
    }

    public function test_a_new_slip_cancels_the_old_code_and_the_old_password(): void
    {
        [$user, $first] = $this->register();
        $this->activate($user, $first['code'])->assertOk();

        $res = $this->actingAs($this->staff(['user_code' => 'PR-9003']))->postJson("/users/{$user->id}/activation-slip")->assertOk();
        $second = $res->json('activation_slip');

        $this->assertNotSame($first['code'], $second['code']);
        $this->assertNull($user->fresh()->password);   // the old password no longer exists
        $this->activate($user, $first['code'])->assertStatus(422);
        $this->activate($user, $second['code'])->assertOk();
    }

    public function test_only_staff_can_print_a_slip_and_never_for_a_staff_account(): void
    {
        [$user] = $this->register();

        $this->actingAs($this->makeUser('Resident', ['user_code' => 'PR-9001']))->postJson("/users/{$user->id}/activation-slip")->assertStatus(403);
        $other = $this->staff(['has_account' => 1, 'user_code' => 'PR-9002']);
        $this->actingAs($this->staff(['user_code' => 'PR-9004']))->postJson("/users/{$other->id}/activation-slip")->assertStatus(403);
    }
}

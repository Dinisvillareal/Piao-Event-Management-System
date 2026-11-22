<?php

namespace Tests\Feature;

use App\Models\StaffRecoveryCode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Support;
use Tests\TestCase;

/** Chapter IV – Authentication and Account Security / Staff Account Management (TC-01 … TC-14). */
class Ch4AuthSecurityTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        RateLimiter::clear('x');
    }

    public function test_tc01_resident_logs_in_with_valid_credentials(): void
    {
        $u = $this->makeUser('Resident');
        $this->postJson('/login', ['username' => $u->user_code, 'password' => 'Passw0rd!Strong#1'])->assertOk();
        $this->assertAuthenticatedAs($u);
    }

    public function test_tc02_wrong_password_is_rate_limited_after_five_tries(): void
    {
        $u = $this->makeUser('Resident');
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/login', ['username' => $u->user_code, 'password' => 'wrong'])->assertStatus(401);
        }
        // the correct password is now refused too, because the account is rate limited
        $this->postJson('/login', ['username' => $u->user_code, 'password' => 'Passw0rd!Strong#1'])->assertStatus(429);
    }

    public function test_tc03_staff_with_2fa_must_give_a_valid_authenticator_code(): void
    {
        $s = $this->staff();
        $secret = $this->enableTwoFactor($s);
        $this->postJson('/login', ['username' => $s->user_code, 'password' => 'Passw0rd!Strong#1'])
            ->assertStatus(401)->assertJson(['two_factor_required' => true]);
        $this->postJson('/login', ['username' => $s->user_code, 'password' => 'Passw0rd!Strong#1', 'otp' => '000000'])
            ->assertStatus(401);
        $this->postJson('/login', ['username' => $s->user_code, 'password' => 'Passw0rd!Strong#1', 'otp' => $this->otp($secret)])
            ->assertOk();
    }

    public function test_tc04_logout_ends_the_session(): void
    {
        $u = $this->makeUser('Resident');
        $this->actingAs($u)->postJson('/logout')->assertOk();
        $this->assertGuest();
        $this->getJson('/me')->assertStatus(401);
    }

    public function test_tc05_weak_new_password_is_rejected(): void
    {
        $u = $this->makeUser('Resident');
        $this->actingAs($u)->patchJson("/users/{$u->id}/change-password", [
            'current_password' => 'Passw0rd!Strong#1', 'new_password' => 'abc123', 'new_password_confirmation' => 'abc123',
        ])->assertStatus(422)->assertJsonValidationErrors('new_password');
    }

    public function test_tc06_strong_password_change_replaces_the_old_password(): void
    {
        $u = $this->makeUser('Resident');
        $this->actingAs($u)->patchJson("/users/{$u->id}/change-password", [
            'current_password' => 'Passw0rd!Strong#1', 'new_password' => 'N3w!Passw0rd#Long9', 'new_password_confirmation' => 'N3w!Passw0rd#Long9',
        ])->assertOk();
        $this->assertTrue(\Hash::check('N3w!Passw0rd#Long9', $u->fresh()->password));
        $this->assertFalse(\Hash::check('Passw0rd!Strong#1', $u->fresh()->password));
    }

    public function test_tc08_head_staff_regenerates_recovery_codes_with_password_and_code(): void
    {
        $h = $this->headStaff();
        $secret = $this->enableTwoFactor($h);
        StaffRecoveryCode::create(['user_id' => $h->id, 'code_hash' => bcrypt('OLDCODE123')]);
        $res = $this->actingAs($h)->postJson('/staff-accounts/recovery-codes', [
            'password' => 'Passw0rd!Strong#1', 'otp' => $this->otp($secret),
        ])->assertOk();
        $this->assertCount(8, $res->json('codes'));
        $this->assertSame(8, StaffRecoveryCode::where('user_id', $h->id)->count()); // old code replaced
    }

    public function test_tc09_recovery_codes_refused_with_wrong_authenticator_code(): void
    {
        $h = $this->headStaff();
        $this->enableTwoFactor($h);
        $this->actingAs($h)->postJson('/staff-accounts/recovery-codes', [
            'password' => 'Passw0rd!Strong#1', 'otp' => '000000',
        ])->assertStatus(422);
        $this->assertSame(0, StaffRecoveryCode::where('user_id', $h->id)->count());
    }

    public function test_tc09b_recovery_codes_refused_without_two_step_set_up(): void
    {
        $h = $this->headStaff();
        $this->actingAs($h)->postJson('/staff-accounts/recovery-codes', ['password' => 'Passw0rd!Strong#1'])->assertStatus(422);
    }

    public function test_tc13_non_head_staff_cannot_manage_staff_accounts(): void
    {
        $s = $this->staff();
        $this->actingAs($s)->postJson('/staff-accounts/recovery-codes', ['password' => 'Passw0rd!Strong#1'])->assertStatus(403);
        $this->actingAs($s)->postJson('/staff-accounts/promote', [])->assertStatus(403);
    }

    public function test_tc12_reset_password_needs_password_and_authenticator_code(): void
    {
        $h = $this->headStaff();
        $secret = $this->enableTwoFactor($h);
        $target = $this->staff();
        $this->actingAs($h)->postJson("/staff-accounts/{$target->id}/reset-password", ['password' => 'Passw0rd!Strong#1', 'otp' => '000000'])
            ->assertStatus(422);
        $res = $this->actingAs($h)->postJson("/staff-accounts/{$target->id}/reset-password", ['password' => 'Passw0rd!Strong#1', 'otp' => $this->otp($secret)])
            ->assertOk()->assertJsonStructure(['activation_slip' => ['user_code', 'name', 'code', 'expires_at', 'issued_by']]);
        $this->assertArrayNotHasKey('temporary_password', $res->json());
        // the old password no longer works and only a hash of the code is kept
        $fresh = $target->fresh();
        $this->assertNull($fresh->password);
        $this->assertTrue((bool) $fresh->pending_activation);
        $this->assertNotSame($res->json('activation_slip.code'), $fresh->activation_code_hash);
    }

    public function test_suspend_remove_access_and_make_head_staff_need_password_and_authenticator_code(): void
    {
        $h = $this->headStaff();
        $secret = $this->enableTwoFactor($h);
        $target = $this->staff();
        $pw = 'Passw0rd!Strong#1';

        // password alone is not enough
        $this->actingAs($h)->postJson("/staff-accounts/{$target->id}/suspend", ['password' => $pw])->assertStatus(422);
        $this->actingAs($h)->postJson("/staff-accounts/{$target->id}/suspend", ['password' => $pw, 'otp' => '000000'])->assertStatus(422);
        $this->assertNull($target->fresh()->suspended_at);
        $this->actingAs($h)->postJson('/staff-accounts/transfer', ['to_user_id' => $target->id, 'password' => $pw])->assertStatus(422);
        $this->actingAs($h)->postJson("/staff-accounts/{$target->id}/demote", ['password' => $pw])->assertStatus(422);
        $this->assertSame('Staff', $target->fresh()->role);

        $this->actingAs($h)->postJson("/staff-accounts/{$target->id}/suspend", ['password' => $pw, 'otp' => $this->otp($secret)])->assertOk();
        $this->assertNotNull($target->fresh()->suspended_at);
    }
}

<?php

namespace Tests;

use App\Models\User;
use App\Support\Totp;
use Illuminate\Support\Facades\Crypt;

/** Small helpers shared by the Chapter IV functional tests. */
trait Support
{
    protected function makeUser(string $role = 'Resident', array $extra = []): User
    {
        static $n = 100;
        $n++;
        $u = new User();
        $u->forceFill(array_merge([
            'user_code'      => 'PR-' . $n,
            'first_name'     => 'Test' . $n,
            'last_name'      => 'User' . $n,
            'contact_number' => '0917' . str_pad((string) $n, 7, '1', STR_PAD_LEFT),
            'role'           => $role,
            'password'       => bcrypt('Passw0rd!Strong#1'),
            'has_account'    => true,
        ], $extra))->save();
        return $u->fresh();
    }

    protected function staff(array $extra = []): User { return $this->makeUser('Staff', $extra); }
    protected function headStaff(array $extra = []): User { return $this->makeUser('Staff', array_merge(['is_head_staff' => true], $extra)); }

    /** Turn two-step verification on for $u and return the plain secret. */
    protected function enableTwoFactor(User $u): string
    {
        $secret = Totp::generateSecret();
        $u->forceFill([
            'two_factor_secret'       => Crypt::encryptString($secret),
            'two_factor_confirmed_at' => now(),
        ])->save();
        return $secret;
    }

    protected function otp(string $secret, int $stepOffset = 0): string
    {
        return Totp::at($secret, intdiv(time(), 30) + $stepOffset);
    }
}

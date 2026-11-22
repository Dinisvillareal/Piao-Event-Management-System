<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * One-time activation slips. Nobody types or sees an account's password: the
 * system makes a random code, keeps only its hash, and returns the code once
 * so it can be printed. The person uses it (with their user code) to choose
 * their own password. Used for residents (UserController) and for staff
 * accounts that the Head Staff resets (StaffAccountController).
 */
class ActivationSlipService
{
    public const HOURS = 48;

    /** Makes a new one-time code for the account and returns what the slip shows (once). */
    public function issue(User $user, ?User $issuer = null): array
    {
        $issuer ??= auth()->user();
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L: easy to read from paper
        $code = '';
        for ($i = 0; $i < 12; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $expires = now()->addHours(self::HOURS);

        $user->forceFill([
            'password' => null,
            'must_change_password' => false,
            'password_changed_at' => null,
            'activation_code_hash' => Hash::make($code),
            'activation_expires_at' => $expires,
            'activation_failed_attempts' => 0,
            'activation_issued_by' => $issuer?->user_code,
        ])->save();

        // Any session the account still had ends: the old password no longer exists.
        app(SecurityService::class)->revokeSessions($user);

        return [
            'user_code' => $user->user_code,
            'name' => $this->displayName($user),
            'code' => implode('-', str_split($code, 4)),
            'expires_at' => $expires->toIso8601String(),
            // The person who prints the slip (shown on the slip as "Issued by").
            'issued_by' => $issuer ? $this->displayName($issuer) : '',
        ];
    }

    /** "FIRST M. LAST JR." -- capitalised, with the middle initial, as printed on the slip. */
    public function displayName(User $u): string
    {
        $mi = trim((string) $u->middle_name) !== '' ? mb_substr(trim($u->middle_name), 0, 1) . '.' : '';
        $parts = array_filter([trim($u->first_name), $mi, trim($u->last_name), trim((string) $u->suffix)]);
        return mb_strtoupper(implode(' ', $parts));
    }
}

<?php

namespace App\Services;

use App\Models\SecurityAlert;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use App\Support\Totp;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Shared helpers for the account-security features: alerts, session
 * revocation, temporary passwords and password re-entry for sensitive
 * actions.
 */
class SecurityService
{
    // ---------------------------------------------------------------
    // Alerts (shown in the staff bell / Security page)
    // ---------------------------------------------------------------

    public function alert(User|int $recipient, string $type, string $title, string $message): void
    {
        $id = $recipient instanceof User ? $recipient->id : $recipient;
        SecurityAlert::create(['user_id' => $id, 'type' => $type, 'title' => $title, 'message' => $message]);
    }

    /** Alert every active Staff account (optionally skipping one). */
    public function alertAllStaff(string $type, string $title, string $message, ?int $exceptUserId = null): void
    {
        User::where('role', 'Staff')->whereNull('suspended_at')
            ->when($exceptUserId, fn ($q) => $q->where('id', '!=', $exceptUserId))
            ->pluck('id')
            ->each(fn ($id) => $this->alert($id, $type, $title, $message));
    }

    public function alertHead(string $type, string $title, string $message, ?int $exceptUserId = null): void
    {
        User::where('role', 'Staff')->where('is_head_staff', true)
            ->when($exceptUserId, fn ($q) => $q->where('id', '!=', $exceptUserId))
            ->pluck('id')
            ->each(fn ($id) => $this->alert($id, $type, $title, $message));
    }

    // ---------------------------------------------------------------
    // Sessions
    // ---------------------------------------------------------------

    /** Sign the user out everywhere (optionally keeping the current session). */
    public function revokeSessions(User $user, ?string $keepSessionId = null): void
    {
        $user->setRememberToken(Str::random(60));
        $user->save();

        if (config('session.driver') === 'database') {
            DB::table(config('session.table', 'sessions'))
                ->where('user_id', $user->id)
                ->when($keepSessionId, fn ($q) => $q->where('id', '!=', $keepSessionId))
                ->delete();
        }
    }

    public function activeSessionCount(User $user): int
    {
        if (config('session.driver') !== 'database') {
            return 0;
        }
        $lifetime = (int) config('session.lifetime', 120) * 60;
        return (int) DB::table(config('session.table', 'sessions'))
            ->where('user_id', $user->id)
            ->where('last_activity', '>=', time() - $lifetime)
            ->count();
    }

    // ---------------------------------------------------------------
    // Passwords
    // ---------------------------------------------------------------

    /** A random one-time password that satisfies the StrongPassword rule. */
    public function temporaryPassword(): string
    {
        $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        $lower = 'abcdefghijkmnopqrstuvwxyz';
        $digit = '23456789';
        $special = '!@#$%&*?';
        $pick = fn (string $set) => $set[random_int(0, strlen($set) - 1)];

        $chars = [$pick($upper), $pick($upper), $pick($lower), $pick($lower), $pick($lower), $pick($lower),
                  $pick($digit), $pick($digit), $pick($digit), $pick($special), $pick($special), $pick($lower)];
        for ($i = count($chars) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$chars[$i], $chars[$j]] = [$chars[$j], $chars[$i]];
        }
        return implode('', $chars);
    }

    /**
     * Password re-entry gate for sensitive actions. Throws a 422 on a wrong
     * password, and locks the gate for 10 minutes after 5 wrong tries so a
     * hijacked, unattended session can't be used to guess the password.
     */
    public function requirePassword(User $user, ?string $password, string $field = 'password'): void
    {
        $key = 'reauth:' . $user->id;

        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages([
                $field => ['Too many wrong attempts. Please wait a few minutes and try again.'],
            ]);
        }

        if (!is_string($password) || $password === '' || !Hash::check($password, $user->password)) {
            RateLimiter::hit($key, 600);
            throw ValidationException::withMessages([$field => ['Incorrect password.']]);
        }

        RateLimiter::clear($key);
    }

    /**
     * Second factor for the highest-risk Head Staff actions (new recovery codes,
     * offering or accepting the Head Staff role, resetting someone's password).
     * A leaked password alone is not enough: the 6-digit code from the person's
     * authenticator app is needed too. An account without two-step login is told
     * to turn it on first, so the protection cannot be skipped by never enabling
     * it. Wrong codes are rate-limited and a code cannot be used twice.
     */
    public function requireTwoFactor(User $user, ?string $code, string $field = 'otp'): void
    {
        if (!$user->two_factor_confirmed_at || !$user->two_factor_secret) {
            throw ValidationException::withMessages([
                $field => ['Turn on two-step login in My Account first. This action needs the code from your authenticator app.'],
            ]);
        }

        $key = 'reauth-otp:' . $user->id;
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages([
                $field => ['Too many wrong codes. Please wait a few minutes and try again.'],
            ]);
        }

        $step = is_string($code) && $code !== ''
            ? Totp::verify(Crypt::decryptString($user->two_factor_secret), $code)
            : null;
        $replayKey = 'totp-used-sensitive:' . $user->id . ':' . $step;

        if ($step === null || Cache::has($replayKey)) {
            RateLimiter::hit($key, 600);
            throw ValidationException::withMessages([
                $field => [$step === null ? 'That code is not valid. Check the 6-digit code in your authenticator app.' : 'That code was just used. Wait for the next one.'],
            ]);
        }

        Cache::put($replayKey, true, 180);
        RateLimiter::clear($key);
    }

    /** Password + authenticator code, in that order. */
    public function requireSensitive(User $user, ?string $password, ?string $otp): void
    {
        $this->requirePassword($user, $password);
        $this->requireTwoFactor($user, $otp);
    }
}

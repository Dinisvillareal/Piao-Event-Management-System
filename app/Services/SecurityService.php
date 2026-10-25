<?php

namespace App\Services;

use App\Models\SecurityAlert;
use App\Models\User;
use Illuminate\Support\Facades\DB;
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
}

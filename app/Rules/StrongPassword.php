<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Single source of truth for the system's password policy (mirrored in
 * resources/js/lib/passwordPolicy.ts for instant client-side feedback):
 *
 *   - at least 8 characters (max 64)
 *   - at least one lowercase letter
 *   - at least one uppercase letter
 *   - at least one digit
 *   - at least one special character (anything that isn't a letter/digit)
 *   - no spaces
 *
 * Applied to every place a password is created or changed (resident
 * create/update, change-password) so the rule can't be bypassed by
 * skipping the UI.
 */
class StrongPassword implements ValidationRule
{
    public const MIN = 8;
    public const MAX = 64; // bcrypt only uses the first 72 bytes; 64 is a sane cap

    public const MESSAGE = 'Password must be at least 8 characters and include a lowercase letter, an uppercase letter, a number, and a special character (no spaces).';

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $value = (string) $value;
        $length = mb_strlen($value);

        $valid = $length >= self::MIN
            && $length <= self::MAX
            && preg_match('/\s/', $value) === 0
            && preg_match('/[a-z]/', $value) === 1
            && preg_match('/[A-Z]/', $value) === 1
            && preg_match('/\d/', $value) === 1
            && preg_match('/[^A-Za-z0-9\s]/', $value) === 1;

        if (!$valid) {
            $fail(self::MESSAGE);
        }
    }
}

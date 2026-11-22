<?php

namespace App\Support;

/**
 * One definition of a valid Philippine mobile number, shared by the app and
 * (as a copy of the same two patterns) by the database constraints added in
 * 2026_11_19_000003_lock_phone_numbers_in_database.
 *
 *  - Residents/staff are stored as 09XXXXXXXXX (11 digits).
 *  - Household numbers are stored as digits only: 09XXXXXXXXX or 639XXXXXXXXX.
 */
class Phone
{
    /** 09 + 9 digits. */
    public const LOCAL = '/^09\d{9}$/';

    /** 09 + 9 digits, or 63 9 + 9 digits (the +63 form without the plus). */
    public const LOCAL_OR_INTL = '/^(63|0)9\d{9}$/';

    public static function digits(mixed $value): string
    {
        return preg_replace('/\D/', '', (string) $value);
    }

    /**
     * The canonical 09XXXXXXXXX form of a number typed as 0917-123-4567,
     * 0917 123 4567, +63 917 123 4567 or 639171234567; null when it is not a
     * valid mobile number.
     */
    public static function canonical(mixed $value): ?string
    {
        $d = self::digits($value);
        if (preg_match('/^639\d{9}$/', $d)) {
            $d = '0' . substr($d, 2);
        }
        return preg_match(self::LOCAL, $d) ? $d : null;
    }
}

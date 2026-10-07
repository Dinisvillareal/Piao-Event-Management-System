<?php

namespace App\Support;

use App\Models\User;

/**
 * The barangay's elected/appointed officials that appear on printed paperwork:
 * the Barangay Captain and the Barangay Secretary.
 *
 * They are not hard-coded anywhere. Staff mark a resident as holding a post
 * (users.barangay_position), and every report / ID card asks this class for the
 * current holder -- so when a new captain or secretary takes office, changing
 * the post on one resident record updates every document automatically.
 *
 * Only one active resident can hold each post (enforced by a DB unique index
 * as well as by assign()).
 */
class BarangayOfficials
{
    public const CAPTAIN = 'captain';
    public const SECRETARY = 'secretary';

    /** position key => title printed under the signature line */
    public const TITLES = [
        self::CAPTAIN => 'Barangay Captain',
        self::SECRETARY => 'Barangay Secretary',
    ];

    public static function isValid(?string $position): bool
    {
        return $position !== null && array_key_exists($position, self::TITLES);
    }

    /**
     * "Librado", "T", "Magcanta", "Jr." => "HON. LIBRADO T. MAGCANTA, JR."
     * Pass $honorific = false to leave the "HON." off.
     */
    public static function formalName(User $user, bool $honorific = true): string
    {
        $parts = [trim((string) $user->first_name)];

        $middle = trim((string) $user->middle_name);
        if ($middle !== '') {
            $parts[] = mb_strtoupper(mb_substr($middle, 0, 1)) . '.';
        }

        $parts[] = trim((string) $user->last_name);
        $name = implode(' ', array_filter($parts, fn ($p) => $p !== ''));

        $suffix = trim((string) $user->suffix);
        if ($suffix !== '') {
            $name .= ', ' . $suffix;
        }

        return ($honorific ? 'HON. ' : '') . mb_strtoupper($name);
    }

    /** Only the Barangay Captain is styled "HON." on paperwork; the Secretary is not. */
    public static function nameFor(User $user, string $position): string
    {
        return self::formalName($user, $position === self::CAPTAIN);
    }

    public static function holder(string $position): ?User
    {
        return User::where('barangay_position', $position)->first();
    }

    /** @return array{id:int,user_code:string,name:string,title:string}|null */
    public static function describe(string $position): ?array
    {
        $user = self::holder($position);
        if (!$user) {
            return null;
        }

        return [
            'id' => $user->id,
            'user_code' => $user->user_code,
            'name' => self::nameFor($user, $position),
            'title' => self::TITLES[$position],
        ];
    }

    /** @return array{captain: ?array, secretary: ?array} */
    public static function current(): array
    {
        return [
            self::CAPTAIN => self::describe(self::CAPTAIN),
            self::SECRETARY => self::describe(self::SECRETARY),
        ];
    }

    /**
     * Give $user the post (or clear it when $position is null/empty).
     * If somebody else holds it, they are stepped down first -- only when
     * $replace is true; otherwise the current holder is returned so the caller
     * can ask for confirmation instead of silently replacing them.
     *
     * Must run inside the caller's DB transaction.
     *
     * @return User|null the conflicting current holder when $replace is false
     */
    public static function assign(User $user, ?string $position, bool $replace = false): ?User
    {
        if (!self::isValid($position)) {
            $user->barangay_position = null;
            return null;
        }

        $current = User::where('barangay_position', $position)
            ->where('id', '!=', $user->id)
            ->first();

        if ($current) {
            if (!$replace) {
                return $current;
            }
            $current->barangay_position = null;
            $current->save();
        }

        $user->barangay_position = $position;
        return null;
    }
}

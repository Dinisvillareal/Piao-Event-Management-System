<?php

namespace App\Support;

use App\Exceptions\MutexBusyException;
use Illuminate\Support\Facades\DB;

/**
 * A short "one at a time" lock for check-then-write jobs that a database row lock cannot cover, such as
 * "is this venue free?" followed by an insert (there is no row yet to lock) or "next code after the last one".
 *
 * On MySQL / MariaDB it is a named lock held by the database connection (GET_LOCK / RELEASE_LOCK): it works
 * across every PHP process and every server talking to the same database, needs no table, and is released
 * by the database itself if the process dies. Take it BEFORE opening the transaction so that what the
 * second caller reads is what the first one committed. On SQLite (the automated tests; one process at a
 * time anyway) it just runs the callback.
 */
final class Mutex
{
    /** Seconds a request waits for its turn before telling the person to try again. */
    public const DEFAULT_WAIT = 10;

    /**
     * @template T
     * @param  callable():T  $callback
     * @return T
     */
    public static function run(string $key, callable $callback, int $wait = self::DEFAULT_WAIT)
    {
        if (!in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return $callback();
        }

        // Lock names are limited to 64 characters; hash so any text (a venue name) is safe.
        $name = 'piao:' . substr(hash('sha256', mb_strtolower($key)), 0, 40);

        $got = DB::selectOne('SELECT GET_LOCK(?, ?) AS got', [$name, $wait]);
        if ((int) ($got->got ?? 0) !== 1) {
            throw new MutexBusyException();
        }

        try {
            return $callback();
        } finally {
            DB::selectOne('SELECT RELEASE_LOCK(?) AS released', [$name]);
        }
    }
}

<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Events\ConnectionEstablished;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Coarse per-IP brake in front of the login endpoint; the precise
        // per-account lockout lives in UserController::login().
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(30)->by($request->ip()));

        // Endpoints that re-check the password (change password, recovery...).
        RateLimiter::for('sensitive', fn (Request $request) => Limit::perMinute(10)->by(($request->user()?->id ?? 'guest') . '|' . $request->ip()));

        // A general ceiling for the signed-in API: far above anything a person or a busy QR scanning
        // station does (about 10 a second), low enough to stop a script from hammering the server.
        RateLimiter::for('app', fn (Request $request) => Limit::perMinute(600)->by(($request->user()?->id ?? 'guest') . '|' . $request->ip()));

        // The queries are written for MySQL (CONCAT, CONCAT_WS). SQLite only
        // gained those functions in 3.44, so older builds -- e.g. the one
        // bundled with many Windows PHP installs -- failed every test. Give
        // SQLite the same two functions so the tests behave identically.
        Event::listen(ConnectionEstablished::class, function (ConnectionEstablished $event): void {
            if ($event->connection->getDriverName() !== 'sqlite') {
                return;
            }
            $pdo = $event->connection->getPdo();
            if (! method_exists($pdo, 'sqliteCreateFunction')) {
                return;
            }
            // Same NULL rules as MySQL: CONCAT is NULL if any part is NULL,
            // CONCAT_WS skips NULL parts.
            $pdo->sqliteCreateFunction('CONCAT', function (...$parts) {
                foreach ($parts as $p) {
                    if ($p === null) {
                        return null;
                    }
                }

                return implode('', $parts);
            }, -1, \PDO::SQLITE_DETERMINISTIC);
            $pdo->sqliteCreateFunction('CONCAT_WS', function ($sep = null, ...$parts) {
                if ($sep === null) {
                    return null;
                }

                return implode($sep, array_filter($parts, fn ($p) => $p !== null));
            }, -1, \PDO::SQLITE_DETERMINISTIC);
        });
    }
}

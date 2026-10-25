<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
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
    }
}

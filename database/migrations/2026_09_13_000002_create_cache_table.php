<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * .env sets CACHE_STORE=database, which requires a `cache` (and
     * `cache_locks`) table to exist -- without it, anything that touches
     * the cache fails with "Base table or view not found: 1146 Table
     * '...cache' doesn't exist". That includes the throttle:6,1 rate
     * limiter now on the /login route (added for the earlier "no rate
     * limiting on login" fix), which uses the app's cache store to
     * track attempt counts. This table was apparently never added when
     * the project's cache driver was set to "database" -- this is
     * Laravel's own standard schema for it (normally generated via
     * `php artisan cache:table`).
     */
    public function up(): void
    {
        Schema::create('cache', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->mediumText('value');
            $table->integer('expiration');
        });

        Schema::create('cache_locks', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->string('owner');
            $table->integer('expiration');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cache_locks');
        Schema::dropIfExists('cache');
    }
};

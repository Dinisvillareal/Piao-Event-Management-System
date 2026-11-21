<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Tests\Support;
use Tests\TestCase;

class SecurityCheckTest extends TestCase
{
    use RefreshDatabase, Support;

    private function run_(array $config = []): array
    {
        config(array_merge(['app.debug' => false, 'app.env' => 'production', 'app.url' => 'https://piao.example', 'session.secure' => true, 'hashing.bcrypt.rounds' => 12], $config));
        $code = Artisan::call('security:check');

        return [$code, Artisan::output()];
    }

    public function test_a_safe_setup_passes(): void
    {
        [$code, $out] = $this->run_();
        $this->assertSame(0, $code, $out);
        $this->assertStringContainsString('Database locks are in place', $out);
        $this->assertStringNotContainsString('FAIL', $out);
    }

    public function test_debug_mode_is_a_failure(): void
    {
        [$code, $out] = $this->run_(['app.debug' => true]);
        $this->assertSame(1, $code);
        $this->assertStringContainsString('APP_DEBUG is true', $out);
    }

    public function test_an_insecure_cookie_over_https_is_a_failure(): void
    {
        [$code, $out] = $this->run_(['session.secure' => false]);
        $this->assertSame(1, $code);
        $this->assertStringContainsString('SESSION_SECURE_COOKIE', $out);
        [$code, $out] = $this->run_(['session.http_only' => false]);
        $this->assertSame(1, $code);
        [$code, $out] = $this->run_(['session.same_site' => 'none']);
        $this->assertSame(1, $code);
    }

    public function test_plain_http_is_only_a_warning(): void
    {
        [$code, $out] = $this->run_(['app.url' => 'http://piao.local', 'session.secure' => false]);
        $this->assertSame(0, $code, $out);
        $this->assertStringContainsString('WARN', $out);
    }

    public function test_a_dropped_lock_is_a_failure_that_names_it(): void
    {
        DB::unprepared('DROP TRIGGER activity_logs_append_only_update');
        [$code, $out] = $this->run_();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('activity_logs_append_only_update', $out);
    }

    public function test_a_tampered_log_is_a_failure(): void
    {
        $this->actingAs($this->staff());
        ActivityLog::create(['user_code' => 'PR-0001', 'action' => 'Create', 'module' => 'Events', 'description' => 'one']);
        ActivityLog::create(['user_code' => 'PR-0001', 'action' => 'Create', 'module' => 'Events', 'description' => 'two']);
        DB::unprepared('DROP TRIGGER activity_logs_append_only_update');
        DB::unprepared('DROP TRIGGER activity_logs_created_at_lock');
        DB::table('activity_logs')->where('description', 'one')->update(['description' => 'changed by hand']);

        [$code, $out] = $this->run_();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('Log fingerprints are intact', $out);
    }

    public function test_the_signed_in_api_has_a_general_request_ceiling(): void
    {
        $limit = RateLimiter::limiter('app')(Request::create('/'));
        $this->assertInstanceOf(Limit::class, $limit);
        $this->assertSame(600, $limit->maxAttempts);

        $protected = collect(Route::getRoutes()->getRoutes())->filter(fn ($r) => in_array('auth', $r->gatherMiddleware(), true));
        $this->assertGreaterThan(50, $protected->count());
        foreach ($protected as $route) {
            $this->assertContains('throttle:app', $route->gatherMiddleware(), $route->uri());
        }
    }
}

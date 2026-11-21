<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;
use Tests\Support;
use Tests\TestCase;

/**
 * Hardening found by the API security audit: leftover routes and "a resident acting on
 * somebody else's record".
 */
class ApiSecurityHardeningTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    // ---------- leftover routes ----------

    public function test_no_html_form_pages_and_no_built_in_file_route_are_left_in_the_json_api(): void
    {
        $staff = $this->staff();
        $this->actingAs($staff)->getJson('/api/memberships/create')->assertStatus(404);   // "create" is not an id and there is no form page
        $this->assertFalse(collect(Route::getRoutes())->contains(fn ($r) => str_starts_with($r->uri(), 'storage/{path}')), 'Laravel built-in private file route is still on');
    }

    // ---------- a resident acting on somebody else ----------

    public function test_a_resident_is_refused_on_every_route_that_takes_another_persons_id(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $resident = $this->makeUser('Resident');
        $other = $this->makeUser('Resident');

        // the only signed-in routes a resident may use with nothing but their own session (their own data, or lists everyone needs)
        $own = ['/age-brackets', '/api/memberships', '/barangay-officials', '/civil-statuses', '/current-statuses', '/feedback/absence/mine', '/feedback/mine',
            '/feedback/pending', '/me', '/name-suffixes', '/notifications', '/notifications/replies', '/notifications/this-week', '/notifications/unread-count',
            '/settings/feedback-rules', '/logout', '/session/keepalive', '/notifications/read-all', '/notifications/replies-read', '/events-data'];
        // resident actions that are validated first and judged on whose record it is inside the controller
        $residentForms = ['/feedback', '/feedback/' . $other->id];   // PUT /feedback/{event} always writes the signed-in person's own rating

        $checked = 0;
        $bad = [];
        foreach (Route::getRoutes() as $r) {
            $mw = array_map(fn ($m) => class_basename(explode(':', $m)[0]), $r->gatherMiddleware());
            if (!in_array('auth', $mw, true) || in_array('EnsureStaff', $mw, true) || in_array('EnsureHeadStaff', $mw, true)) {
                continue;
            }
            $uri = '/' . ltrim(preg_replace(['/\{kind\}/', '/\{[^}]+\}/'], ['rating', (string) $other->id], $r->uri()), '/');
            if (in_array($uri, $own, true) || in_array($uri, $residentForms, true)) {
                continue;
            }
            foreach ($r->methods() as $method) {
                if ($method === 'HEAD') {
                    continue;
                }
                $status = $this->actingAs($resident)->json($method, $uri, [])->getStatusCode();
                $checked++;
                if (!in_array($status, [403, 404, 405], true)) {
                    $bad[] = "{$method} {$uri} -> {$status}";
                }
            }
        }

        $this->assertGreaterThan(40, $checked);
        $this->assertSame([], $bad, 'routes where a resident acting on another person got through');
    }

    public function test_a_resident_gets_a_plain_refusal_not_the_form_rules_when_registering_someone(): void
    {
        $resident = $this->makeUser('Resident');

        $this->actingAs($resident)->postJson('/users', [])->assertStatus(403)->assertJson(['message' => 'Unauthorized']);   // not a 422 listing the fields
    }
}

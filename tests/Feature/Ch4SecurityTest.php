<?php

namespace Tests\Feature;

use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;
use Tests\Support;
use Tests\TestCase;

/** Chapter IV – server-side security checks over every route (TC-13, TC-63 and the NFR "role-based access enforced on the server"). */
class Ch4SecurityTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        // the rate limiter is covered by its own tests; here every route must be reachable to be judged
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
    }

    /** @return array<int,array{0:string,1:string,2:array}> [method, uri, middleware-short-names] */
    private function routes(): array
    {
        $out = [];
        foreach (Route::getRoutes() as $r) {
            $mw = array_map(fn ($m) => class_basename(explode(':', $m)[0]), $r->gatherMiddleware());
            $uri = '/' . ltrim(preg_replace(['/\{kind\}/', '/\{[^}]+\}/'], ['rating', '1'], $r->uri()), '/');
            foreach ($r->methods() as $m) {
                if ($m === 'HEAD') continue;
                $out[] = [$m, $uri, $mw];
            }
        }
        return $out;
    }

    private function hit(string $method, string $uri)
    {
        return $this->json($method, $uri, []);
    }

    public function test_every_staff_only_route_refuses_a_resident(): void
    {
        $resident = $this->makeUser('Resident');
        $checked = 0; $bad = [];
        foreach ($this->routes() as [$m, $uri, $mw]) {
            if (!in_array('EnsureStaff', $mw, true) && !in_array('EnsureHeadStaff', $mw, true)) continue;
            $status = $this->actingAs($resident)->hit($m, $uri)->getStatusCode();
            $checked++;
            if ($status !== 403) $bad[] = "$m $uri -> $status";
        }
        $this->assertGreaterThan(40, $checked);
        $this->assertSame([], $bad, 'staff-only routes that a resident could reach');
    }

    public function test_every_head_staff_route_refuses_ordinary_staff(): void
    {
        $staff = $this->staff();
        $checked = 0; $bad = [];
        foreach ($this->routes() as [$m, $uri, $mw]) {
            if (!in_array('EnsureHeadStaff', $mw, true)) continue;
            $status = $this->actingAs($staff)->hit($m, $uri)->getStatusCode();
            $checked++;
            if ($status !== 403) $bad[] = "$m $uri -> $status";
        }
        $this->assertGreaterThan(5, $checked);
        $this->assertSame([], $bad);
    }

    public function test_every_signed_in_route_refuses_a_visitor(): void
    {
        $bad = []; $checked = 0;
        foreach ($this->routes() as [$m, $uri, $mw]) {
            if (!in_array('auth', $mw, true)) continue;
            $status = $this->hit($m, $uri)->getStatusCode();
            $checked++;
            if ($status !== 401) $bad[] = "$m $uri -> $status";
        }
        $this->assertGreaterThan(100, $checked);
        $this->assertSame([], $bad);
    }

    public function test_a_resident_cannot_read_or_change_another_residents_record(): void
    {
        $a = $this->makeUser('Resident'); $b = $this->makeUser('Resident');
        $this->actingAs($a)->getJson("/users/{$b->id}")->assertStatus(403);
        $this->actingAs($a)->putJson("/users/{$b->id}", ['first_name' => 'Hacked'])->assertStatus(403);
        $this->actingAs($a)->patchJson("/users/{$b->id}/contact-number", ['contact_number' => '09170000000'])->assertStatus(403);
        $this->actingAs($a)->patchJson("/users/{$b->id}/change-password", ['current_password' => 'x', 'new_password' => 'y', 'new_password_confirmation' => 'y'])->assertStatus(403);
        $this->actingAs($a)->deleteJson("/users/{$b->id}")->assertStatus(403);
        $this->assertSame($b->first_name, $b->fresh()->first_name);
    }

    public function test_a_resident_cannot_read_another_residents_attendance_history(): void
    {
        $a = $this->makeUser('Resident'); $b = $this->makeUser('Resident');
        $this->actingAs($a)->getJson("/attendance/{$b->id}")->assertStatus(403);
        $this->actingAs($a)->getJson("/users/{$b->id}/attendances")->assertStatus(403);
    }

    public function test_a_resident_cannot_open_anothers_notification(): void
    {
        $a = $this->makeUser('Resident'); $b = $this->makeUser('Resident');
        $n = Notification::create(['user_id' => $b->id, 'title' => 'T', 'message' => 'M', 'type' => 'event', 'read' => false]);
        $this->actingAs($a)->putJson("/notifications/{$n->id}/read")->assertStatus(404);
        $this->assertFalse((bool) $n->fresh()->read);
    }

    public function test_responses_carry_security_headers(): void
    {
        $res = $this->postJson('/login', ['username' => 'nobody', 'password' => 'x']);
        $this->assertNotNull($res->headers->get('X-Content-Type-Options'));
        $this->assertNotNull($res->headers->get('X-Frame-Options') ?? $res->headers->get('Content-Security-Policy'));
    }
}

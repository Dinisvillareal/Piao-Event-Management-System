<?php

namespace Tests\Feature;

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Tests\TestCase;

class ContentSecurityPolicyTest extends TestCase
{
    private function headers(): \Symfony\Component\HttpFoundation\ResponseHeaderBag
    {
        return (new SecurityHeaders)->handle(Request::create('/'), fn () => new Response('ok'))->headers;
    }

    public function test_every_page_carries_a_policy_that_allows_only_its_own_scripts(): void
    {
        $hot = public_path('hot');
        $had = is_file($hot);
        $had && rename($hot, $hot . '.bak');

        try {
            $csp = (string) $this->headers()->get('Content-Security-Policy');
            $this->assertStringContainsString("default-src 'self'", $csp);
            $this->assertMatchesRegularExpression("/script-src 'self' 'nonce-[A-Za-z0-9+\\/=]+'/", $csp);
            $this->assertStringNotContainsString('unsafe-eval', $csp);
            $this->assertDoesNotMatchRegularExpression("/script-src[^;]*unsafe-inline/", $csp);
            $this->assertStringContainsString("object-src 'none'", $csp);
            $this->assertStringContainsString("frame-ancestors 'self'", $csp);
            $this->assertStringContainsString("form-action 'self'", $csp);
            $this->assertStringContainsString("base-uri 'self'", $csp);
        } finally {
            $had && rename($hot . '.bak', $hot);
        }
    }

    public function test_the_one_time_code_is_different_on_every_response(): void
    {
        $hot = public_path('hot');
        $had = is_file($hot);
        $had && rename($hot, $hot . '.bak');

        try {
            $a = (string) $this->headers()->get('Content-Security-Policy');
            $b = (string) $this->headers()->get('Content-Security-Policy');
            $this->assertNotSame($a, $b);
        } finally {
            $had && rename($hot . '.bak', $hot);
        }
    }

    public function test_the_pages_inline_script_carries_the_code(): void
    {
        foreach (['app', 'welcome'] as $view) {
            $html = file_get_contents(resource_path("views/{$view}.blade.php"));
            $this->assertMatchesRegularExpression('/<script nonce="\{\{ Vite::cspNonce\(\) \}\}">/', $html, $view);
            $this->assertDoesNotMatchRegularExpression('/<script>/', $html, $view);
        }
    }

    public function test_the_other_browser_protections_stay_in_place(): void
    {
        $h = $this->headers();
        $this->assertSame('nosniff', $h->get('X-Content-Type-Options'));
        $this->assertSame('SAMEORIGIN', $h->get('X-Frame-Options'));
        $this->assertNotNull($h->get('Permissions-Policy'));
    }
}

<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/** Baseline browser-side protections for every response. */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        // A fresh one-time code for this response: only the page's own inline script carries it.
        $nonce = base64_encode(random_bytes(16));
        Vite::useCspNonce($nonce);

        $response = $next($request);

        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        // The QR scanner needs the camera on this site; nothing else is allowed.
        $response->headers->set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
        // Content-Security-Policy: the browser runs only this site's own scripts. A script injected into a page
        // (stored XSS) is refused, and nothing may frame the site or send a form elsewhere. Skipped only while
        // the Vite development server is running, which loads scripts from another port.
        if (! is_file(public_path('hot'))) {
            $response->headers->set('Content-Security-Policy', implode('; ', [
                "default-src 'self'",
                "script-src 'self' 'nonce-{$nonce}'",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com data:",
                "img-src 'self' data: blob:",
                "media-src 'self' blob:",
                "connect-src 'self'",
                "frame-src 'self' blob:",
                "worker-src 'self' blob:",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'self'",
            ]));
        }
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        // Signed-in JSON (account data, alerts) must never be cached by a browser or proxy.
        if (str_contains((string) $response->headers->get('Content-Type'), 'json')) {
            $response->headers->set('Cache-Control', 'no-store, private');
        }

        return $response;
    }
}

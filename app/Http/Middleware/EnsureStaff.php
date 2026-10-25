<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Route-level guard: only Staff accounts get through. */
class EnsureStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role !== 'Staff') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        return $next($request);
    }
}

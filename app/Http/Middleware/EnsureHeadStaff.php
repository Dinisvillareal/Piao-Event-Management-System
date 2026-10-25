<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Route-level guard: only the Head Staff gets through. */
class EnsureHeadStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Staff' || !$user->is_head_staff || $user->suspended_at) {
            return response()->json(['message' => 'Only the Head Staff can do this.'], 403);
        }
        return $next($request);
    }
}

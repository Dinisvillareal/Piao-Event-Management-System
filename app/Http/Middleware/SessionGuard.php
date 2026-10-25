<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Runs after `auth` on every protected route:
 *  - a suspended account is signed out on its very next request;
 *  - staff sessions end after a period of real inactivity (Head Staff 30 min,
 *    other staff 60 min). Background polling does NOT count as activity --
 *    only changes (non-GET requests) and the page's keep-alive ping, which
 *    the browser sends while the person is actually using the page;
 *  - an account that must change its password can do nothing else until it has.
 */
class SessionGuard
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user) {
            if ($user->suspended_at) {
                return $this->kick($request, 'suspended', 'This account has been suspended.');
            }

            if ($user->role === 'Staff') {
                $limit = ($user->is_head_staff ? 30 : 60) * 60;
                $last = (int) $request->session()->get('last_activity_at', 0);

                if ($last > 0 && (time() - $last) > $limit) {
                    return $this->kick($request, 'session_expired', 'You were signed out because of inactivity.');
                }
                if ($last === 0 || !$request->isMethodSafe()) {
                    $request->session()->put('last_activity_at', time());
                }
                if ($request->is('session/keepalive')) {
                    $request->session()->put('last_activity_at', time());
                }
            }

            if ($user->must_change_password && !$this->allowedWhileForced($request, $user->id)) {
                return response()->json([
                    'message' => 'You must change your password before continuing.',
                    'code' => 'password_change_required',
                ], 403);
            }
        }

        return $next($request);
    }

    private function allowedWhileForced(Request $request, int $userId): bool
    {
        if ($request->is('me', 'logout', 'session/keepalive')) {
            return true;
        }
        return $request->is('users/*/change-password') && (int) $request->route('id') === $userId;
    }

    private function kick(Request $request, string $code, string $message): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => $message, 'code' => $code], 401);
    }
}

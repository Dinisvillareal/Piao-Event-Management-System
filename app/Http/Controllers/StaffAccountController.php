<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\HeadStaffTransfer;
use App\Models\SecurityAlert;
use App\Models\StaffRecoveryCode;
use App\Models\User;
use App\Rules\StrongPassword;
use App\Services\SecurityService;
use App\Support\Totp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Staff account management and account-security features.
 *
 * Routes are guarded in routes/web.php:
 *   - Head Staff only: list / promote / demote / suspend / reset password /
 *     transfer / recovery codes.
 *   - Any Staff: own alerts, own two-step login, accepting a Head Staff
 *     transfer addressed to them, the keep-alive ping.
 * Every sensitive action also re-asks for the caller's own password.
 */
class StaffAccountController extends Controller
{
    protected $logModule = 'Staff Accounts';

    private const TRANSFER_HOURS = 48;
    private const RECOVERY_CODE_COUNT = 8;

    public function __construct(private SecurityService $security)
    {
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private function fullName(User $u): string
    {
        return trim(preg_replace('/\s+/', ' ', "{$u->first_name} {$u->middle_name} {$u->last_name} {$u->suffix}"));
    }

    private function staffTarget($id): User
    {
        return User::where('role', 'Staff')->findOrFail($id);
    }

    private function pendingTransfer(): ?HeadStaffTransfer
    {
        HeadStaffTransfer::where('status', 'pending')->where('expires_at', '<=', now())->update(['status' => 'expired']);
        return HeadStaffTransfer::where('status', 'pending')->with(['from', 'to'])->latest('id')->first();
    }

    private function row(User $u): array
    {
        return [
            'id' => $u->id,
            'user_code' => $u->user_code,
            'name' => $this->fullName($u),
            'barangay_position' => $u->barangay_position,
            'is_head_staff' => (bool) $u->is_head_staff,
            'suspended_at' => $u->suspended_at,
            'last_login_at' => $u->last_login_at,
            'must_change_password' => (bool) $u->must_change_password,
            'two_factor_enabled' => $u->two_factor_enabled,
            'active_sessions' => $this->security->activeSessionCount($u),
        ];
    }

    // ------------------------------------------------------------------
    // Head Staff: overview
    // ------------------------------------------------------------------

    public function index()
    {
        $staff = User::where('role', 'Staff')
            ->orderByDesc('is_head_staff')->orderBy('first_name')->get()
            ->map(fn ($u) => $this->row($u))->values();

        $transfer = $this->pendingTransfer();

        return response()->json([
            'staff' => $staff,
            'transfer' => $transfer ? [
                'id' => $transfer->id,
                'to_user_id' => $transfer->to_user_id,
                'to_name' => $transfer->to ? $this->fullName($transfer->to) : null,
                'expires_at' => $transfer->expires_at,
            ] : null,
            'recovery_codes_remaining' => StaffRecoveryCode::where('user_id', auth()->id())->whereNull('used_at')->count(),
            'transfer_hours' => self::TRANSFER_HOURS,
        ]);
    }

    /** Residents who could be promoted (must already have a portal account). */
    public function candidates(Request $request)
    {
        $term = trim((string) $request->query('search', ''));

        $q = User::where('role', 'Resident')->where('has_account', 1)->whereNull('suspended_at');
        if ($term !== '') {
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $term) . '%';
            $q->where(fn ($w) => $w->where('first_name', 'like', $like)
                ->orWhere('last_name', 'like', $like)
                ->orWhere('user_code', 'like', $like));
        }

        return response()->json(
            $q->orderBy('first_name')->limit(15)->get()->map(fn ($u) => [
                'id' => $u->id,
                'user_code' => $u->user_code,
                'name' => $this->fullName($u),
                'barangay_position' => $u->barangay_position,
            ])->values()
        );
    }

    // ------------------------------------------------------------------
    // Head Staff: promote / demote / suspend / sign out / reset password
    // ------------------------------------------------------------------

    public function promote(Request $request)
    {
        $request->validate(['user_id' => 'required|integer', 'password' => 'required|string']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        $target = User::where('role', 'Resident')->where('has_account', 1)->findOrFail($request->user_id);

        $target->role = 'Staff';
        $target->save();

        $this->createLog('Promote Staff', "Granted Staff access to {$target->user_code}");
        $this->security->alertAllStaff('staff_promoted', 'New staff member',
            "{$this->fullName($target)} ({$target->user_code}) was given Staff access by the Head Staff.");
        $this->security->alert($target, 'staff_promoted', 'You are now Staff',
            'The Head Staff gave you Staff access. Sign in again to see the staff pages.');

        return response()->json(['message' => 'Staff access granted.', 'staff' => $this->row($target)]);
    }

    public function demote(Request $request, $id)
    {
        $request->validate(['password' => 'required|string']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        $target = $this->staffTarget($id);
        if ($target->id === $me->id || $target->is_head_staff) {
            return response()->json(['message' => 'The Head Staff cannot be removed. Transfer the role first.'], 422);
        }

        DB::transaction(function () use ($target) {
            $target->role = 'Resident';
            $target->two_factor_secret = null;
            $target->two_factor_confirmed_at = null;
            $target->save();
        });
        $this->security->revokeSessions($target);

        $this->createLog('Remove Staff', "Removed Staff access from {$target->user_code}");
        $this->security->alertAllStaff('staff_removed', 'Staff access removed',
            "{$this->fullName($target)} ({$target->user_code}) no longer has Staff access.", $target->id);

        return response()->json(['message' => 'Staff access removed.']);
    }

    public function suspend(Request $request, $id)
    {
        $request->validate(['password' => 'required|string']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        $target = $this->staffTarget($id);
        if ($target->id === $me->id || $target->is_head_staff) {
            return response()->json(['message' => 'The Head Staff cannot be suspended.'], 422);
        }

        $target->suspended_at = now();
        $target->save();
        $this->security->revokeSessions($target);

        $this->createLog('Suspend Staff', "Suspended {$target->user_code}");
        $this->security->alertAllStaff('staff_suspended', 'Account suspended',
            "{$this->fullName($target)} ({$target->user_code}) was suspended and signed out.", $target->id);

        return response()->json(['message' => 'Account suspended.']);
    }

    public function unsuspend(Request $request, $id)
    {
        $request->validate(['password' => 'required|string']);
        $this->security->requirePassword($request->user(), $request->password);

        $target = $this->staffTarget($id);
        $target->suspended_at = null;
        $target->failed_login_attempts = 0;
        $target->locked_until = null;
        $target->save();

        $this->createLog('Unsuspend Staff', "Reactivated {$target->user_code}");
        $this->security->alertAllStaff('staff_unsuspended', 'Account reactivated',
            "{$this->fullName($target)} ({$target->user_code}) was reactivated.", $target->id);

        return response()->json(['message' => 'Account reactivated.']);
    }

    public function signOut(Request $request, $id)
    {
        $target = $this->staffTarget($id);
        $keep = $target->id === $request->user()->id ? $request->session()->getId() : null;
        $this->security->revokeSessions($target, $keep);

        $this->createLog('Sign Out Staff', "Signed {$target->user_code} out of all devices");
        if ($target->id !== $request->user()->id) {
            $this->security->alert($target, 'signed_out', 'Signed out everywhere',
                'The Head Staff signed your account out of all devices.');
        }

        return response()->json(['message' => 'Signed out of all devices.']);
    }

    public function resetPassword(Request $request, $id)
    {
        $request->validate(['password' => 'required|string']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        $target = $this->staffTarget($id);
        if ($target->id === $me->id) {
            return response()->json(['message' => 'Change your own password from My Account.'], 422);
        }

        $temporary = $this->security->temporaryPassword();
        $target->password = Hash::make($temporary);
        $target->has_account = 1;
        $target->must_change_password = true;
        $target->password_changed_at = null;
        $target->failed_login_attempts = 0;
        $target->locked_until = null;
        $target->save();
        $this->security->revokeSessions($target);

        $this->createLog('Reset Staff Password', "Reset the password of {$target->user_code} (temporary password issued)");
        $this->security->alert($target, 'password_reset', 'Password reset',
            'The Head Staff reset your password. Sign in with the temporary password and choose a new one.');
        $this->security->alertAllStaff('password_reset', 'Staff password reset',
            "The password of {$this->fullName($target)} ({$target->user_code}) was reset by the Head Staff.", $target->id);

        // Shown to the Head Staff exactly once.
        return response()->json(['message' => 'Temporary password created.', 'temporary_password' => $temporary]);
    }

    // ------------------------------------------------------------------
    // Head Staff transfer
    // ------------------------------------------------------------------

    public function startTransfer(Request $request)
    {
        $request->validate(['to_user_id' => 'required|integer', 'password' => 'required|string']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        $target = $this->staffTarget($request->to_user_id);
        if ($target->id === $me->id || $target->suspended_at) {
            return response()->json(['message' => 'Choose another active staff member.'], 422);
        }

        HeadStaffTransfer::where('status', 'pending')->update(['status' => 'cancelled']);
        $transfer = HeadStaffTransfer::create([
            'from_user_id' => $me->id,
            'to_user_id' => $target->id,
            'status' => 'pending',
            'expires_at' => now()->addHours(self::TRANSFER_HOURS),
        ]);

        $this->createLog('Head Staff Transfer', "Offered the Head Staff role to {$target->user_code}");
        $this->security->alert($target, 'transfer_offered', 'Head Staff transfer waiting',
            'You were offered the Head Staff role. Open Staff Accounts to accept it with your password. The offer ends in ' . self::TRANSFER_HOURS . ' hours.');
        $this->security->alertAllStaff('transfer_offered', 'Head Staff transfer started',
            "The Head Staff offered the role to {$this->fullName($target)} ({$target->user_code}).", $target->id);

        return response()->json(['message' => 'Transfer offered.', 'id' => $transfer->id]);
    }

    public function cancelTransfer(Request $request)
    {
        $updated = HeadStaffTransfer::where('status', 'pending')->update(['status' => 'cancelled']);
        if ($updated) {
            $this->createLog('Head Staff Transfer', 'Cancelled the pending Head Staff transfer');
        }
        return response()->json(['message' => 'Transfer cancelled.']);
    }

    /** Any staff member: is there a transfer offered to ME? */
    public function myTransfer(Request $request)
    {
        $t = $this->pendingTransfer();
        if (!$t || $t->to_user_id !== $request->user()->id) {
            return response()->json(['transfer' => null]);
        }
        return response()->json(['transfer' => [
            'id' => $t->id,
            'from_name' => $t->from ? $this->fullName($t->from) : null,
            'expires_at' => $t->expires_at,
        ]]);
    }

    public function acceptTransfer(Request $request)
    {
        $request->validate(['password' => 'required|string']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        $transfer = $this->pendingTransfer();
        if (!$transfer || $transfer->to_user_id !== $me->id) {
            return response()->json(['message' => 'There is no transfer waiting for you.'], 404);
        }

        $from = User::where('role', 'Staff')->whereNull('suspended_at')->find($transfer->from_user_id);
        if (!$from || !$from->is_head_staff) {
            $transfer->update(['status' => 'cancelled']);
            return response()->json(['message' => 'This transfer is no longer valid.'], 422);
        }

        DB::transaction(function () use ($from, $me, $transfer) {
            $from->is_head_staff = false;
            $from->save();
            $me->is_head_staff = true;
            $me->save();
            $transfer->update(['status' => 'accepted']);
        });

        $this->security->revokeSessions($from);

        $this->createLog('Head Staff Transfer', "{$me->user_code} accepted the Head Staff role from {$from->user_code}");
        $this->security->alertAllStaff('head_changed', 'New Head Staff',
            "{$this->fullName($me)} ({$me->user_code}) is now the Head Staff.");

        return response()->json(['message' => 'You are now the Head Staff.']);
    }

    // ------------------------------------------------------------------
    // Recovery codes (Head Staff)
    // ------------------------------------------------------------------

    public function regenerateRecoveryCodes(Request $request)
    {
        $request->validate(['password' => 'required|string']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $codes = [];
        DB::transaction(function () use ($me, $alphabet, &$codes) {
            StaffRecoveryCode::where('user_id', $me->id)->delete();
            for ($i = 0; $i < self::RECOVERY_CODE_COUNT; $i++) {
                $raw = '';
                for ($j = 0; $j < 10; $j++) {
                    $raw .= $alphabet[random_int(0, strlen($alphabet) - 1)];
                }
                StaffRecoveryCode::create(['user_id' => $me->id, 'code_hash' => Hash::make($raw)]);
                $codes[] = substr($raw, 0, 5) . '-' . substr($raw, 5);
            }
        });

        $this->createLog('Recovery Codes', 'Generated new recovery codes for the Head Staff account');
        $this->security->alert($me, 'recovery_codes', 'New recovery codes created',
            'New recovery codes were generated. Any older codes no longer work.');

        // The ONLY time the codes are ever shown.
        return response()->json(['codes' => $codes]);
    }

    /**
     * PUBLIC (login page): use a recovery code to reset the Head Staff
     * password. Heavily rate-limited; every failure looks the same.
     */
    public function recoverHeadAccess(Request $request)
    {
        $request->validate([
            'user_code' => 'required|string|max:50',
            'recovery_code' => 'required|string|max:40',
            'new_password' => ['required', 'string', 'confirmed', new StrongPassword(12)],
        ]);

        $fail = fn () => response()->json(['message' => 'Those recovery details are not valid.'], 422);

        $key = 'recover:' . $request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json(['message' => 'Too many attempts. Please wait 15 minutes and try again.'], 429);
        }
        RateLimiter::hit($key, 900);

        $head = User::where('user_code', trim($request->user_code))
            ->where('role', 'Staff')->where('is_head_staff', true)->whereNull('suspended_at')->first();

        $normalized = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $request->recovery_code));
        $match = null;

        if ($head) {
            foreach (StaffRecoveryCode::where('user_id', $head->id)->whereNull('used_at')->get() as $code) {
                if (Hash::check($normalized, $code->code_hash)) {
                    $match = $code;
                    break;
                }
            }
        } else {
            Hash::check($normalized, Hash::make('timing-pad')); // keep timing similar
        }

        if (!$head || !$match) {
            return $fail();
        }

        DB::transaction(function () use ($head, $match) {
            $match->update(['used_at' => now()]);
            $head->password = Hash::make(request('new_password'));
            $head->must_change_password = false;
            $head->password_changed_at = now();
            $head->failed_login_attempts = 0;
            $head->locked_until = null;
            // Using the break-glass code also resets the authenticator, in case
            // the phone was lost together with the password.
            $head->two_factor_secret = null;
            $head->two_factor_confirmed_at = null;
            $head->save();
        });
        $this->security->revokeSessions($head);
        RateLimiter::clear($key);

        $left = StaffRecoveryCode::where('user_id', $head->id)->whereNull('used_at')->count();
        ActivityLog::create([
            'user_code' => $head->user_code,
            'action' => 'Recovery Code Used',
            'module' => 'Authentication',
            'description' => "A recovery code was used to reset the Head Staff password ({$left} left)",
        ]);
        $this->security->alertAllStaff('recovery_used', 'Recovery code used',
            "A recovery code was used to reset the Head Staff password. {$left} recovery codes remain. If this wasn't planned, act now.");

        return response()->json(['message' => 'Password reset. You can sign in now.']);
    }

    // ------------------------------------------------------------------
    // Two-step login (any staff member, for their own account)
    // ------------------------------------------------------------------

    public function twoFactorSetup(Request $request)
    {
        $request->validate(['password' => 'required|string']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        if ($me->two_factor_confirmed_at) {
            return response()->json(['message' => 'Two-step login is already on.'], 422);
        }

        $secret = Totp::generateSecret();
        $me->two_factor_secret = Crypt::encryptString($secret);
        $me->save();

        return response()->json([
            'secret' => $secret,
            'uri' => Totp::uri($secret, $me->user_code),
        ]);
    }

    public function twoFactorConfirm(Request $request)
    {
        $request->validate(['code' => 'required|string|max:12']);
        $me = $request->user();

        if ($me->two_factor_confirmed_at || !$me->two_factor_secret) {
            return response()->json(['message' => 'Start the setup first.'], 422);
        }
        $key = 'tfa-confirm:' . $me->id;
        if (RateLimiter::tooManyAttempts($key, 8)) {
            return response()->json(['message' => 'Too many attempts. Please wait a few minutes.'], 429);
        }

        if (Totp::verify(Crypt::decryptString($me->two_factor_secret), $request->code) === null) {
            RateLimiter::hit($key, 600);
            return response()->json(['errors' => ['code' => ['That code is not valid. Check the time on your phone and try again.']]], 422);
        }

        RateLimiter::clear($key);
        $me->two_factor_confirmed_at = now();
        $me->save();

        $this->createLog('Two-Step Login', "{$me->user_code} turned on two-step login");
        $this->security->alert($me, 'two_factor_on', 'Two-step login is on',
            'Signing in now needs a code from your authenticator app.');

        return response()->json(['message' => 'Two-step login is on.']);
    }

    public function twoFactorDisable(Request $request)
    {
        $request->validate(['password' => 'required|string', 'code' => 'required|string|max:12']);
        $me = $request->user();
        $this->security->requirePassword($me, $request->password);

        if (!$me->two_factor_confirmed_at || !$me->two_factor_secret) {
            return response()->json(['message' => 'Two-step login is not on.'], 422);
        }
        if (Totp::verify(Crypt::decryptString($me->two_factor_secret), $request->code) === null) {
            return response()->json(['errors' => ['code' => ['That code is not valid.']]], 422);
        }

        $me->two_factor_secret = null;
        $me->two_factor_confirmed_at = null;
        $me->save();

        $this->createLog('Two-Step Login', "{$me->user_code} turned off two-step login");
        $this->security->alert($me, 'two_factor_off', 'Two-step login turned off',
            'Two-step login was turned off for your account.');
        $this->security->alertHead('two_factor_off', 'Two-step login turned off',
            "{$me->user_code} turned off two-step login.", $me->id);

        return response()->json(['message' => 'Two-step login is off.']);
    }

    // ------------------------------------------------------------------
    // Own security alerts + keep-alive
    // ------------------------------------------------------------------

    public function alerts(Request $request)
    {
        $base = SecurityAlert::where('user_id', $request->user()->id);

        return response()->json([
            'unread_count' => (clone $base)->where('read', false)->count(),
            'data' => (clone $base)->orderByDesc('id')->limit(50)->get(),
        ]);
    }

    public function markAlertRead(Request $request, $id)
    {
        SecurityAlert::where('user_id', $request->user()->id)->where('id', $id)->update(['read' => true]);
        return response()->json(['message' => 'ok']);
    }

    public function markAllAlertsRead(Request $request)
    {
        SecurityAlert::where('user_id', $request->user()->id)->where('read', false)->update(['read' => true]);
        return response()->json(['message' => 'ok']);
    }

    /** The page pings this while someone is really using it (see SessionGuard). */
    public function keepAlive()
    {
        return response()->json(['ok' => true]);
    }
}

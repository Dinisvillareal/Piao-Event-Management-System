<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\User;
use App\Services\SecurityService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

/**
 * Server-side last resort for a locked-out account (for example the Head
 * Staff when the recovery codes are lost). Prints a one-time password that
 * must be changed at the first sign-in.
 */
class StaffResetPassword extends Command
{
    protected $signature = 'staff:reset-password {user_code : e.g. PR-0001}';

    protected $description = 'Issue a one-time temporary password for a Staff account';

    public function handle(SecurityService $security): int
    {
        $user = User::where('user_code', $this->argument('user_code'))->where('role', 'Staff')->first();

        if (!$user) {
            $this->error('No Staff account with that user code.');
            return self::FAILURE;
        }

        $temporary = $security->temporaryPassword();
        $user->password = Hash::make($temporary);
        $user->has_account = 1;
        $user->must_change_password = true;
        $user->password_changed_at = null;
        $user->failed_login_attempts = 0;
        $user->locked_until = null;
        $user->two_factor_secret = null;
        $user->two_factor_confirmed_at = null;
        $user->save();
        $security->revokeSessions($user);

        ActivityLog::create([
            'user_code' => $user->user_code,
            'action' => 'Reset Staff Password',
            'module' => 'Staff Accounts',
            'description' => "Password of {$user->user_code} was reset from the server",
        ]);
        $security->alertAllStaff('password_reset', 'Staff password reset',
            "The password of {$user->user_code} was reset from the server.", $user->id);

        $this->info("Temporary password for {$user->user_code}: {$temporary}");
        $this->line('It must be changed at the first sign-in. Share it only with that person.');
        return self::SUCCESS;
    }
}

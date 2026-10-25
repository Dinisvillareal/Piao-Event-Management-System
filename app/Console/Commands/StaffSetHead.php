<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\User;
use App\Services\SecurityService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Server-side last resort: name the Head Staff when nobody in the app can
 * (first setup, or the previous Head Staff is gone and cannot confirm a
 * transfer). Not reachable from the internet.
 */
class StaffSetHead extends Command
{
    protected $signature = 'staff:set-head {user_code : e.g. PR-0001}';

    protected $description = 'Make a Staff account the Head Staff (replaces the current one)';

    public function handle(SecurityService $security): int
    {
        $user = User::where('user_code', $this->argument('user_code'))->first();

        if (!$user || $user->role !== 'Staff' || $user->suspended_at) {
            $this->error('That account is not an active Staff account.');
            return self::FAILURE;
        }

        DB::transaction(function () use ($user) {
            User::where('is_head_staff', true)->where('id', '!=', $user->id)->update(['is_head_staff' => false]);
            $user->is_head_staff = true;
            $user->save();
        });

        ActivityLog::create([
            'user_code' => $user->user_code,
            'action' => 'Head Staff Set',
            'module' => 'Staff Accounts',
            'description' => "{$user->user_code} was made Head Staff from the server",
        ]);
        $security->alertAllStaff('head_changed', 'New Head Staff', "{$user->user_code} was made the Head Staff.");

        $this->info("{$user->user_code} is now the Head Staff.");
        return self::SUCCESS;
    }
}

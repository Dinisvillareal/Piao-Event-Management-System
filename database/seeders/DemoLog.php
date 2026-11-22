<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\User;
use Carbon\Carbon;

/**
 * Writes one line of the activity log the way the app would have written it when a real person did the
 * thing: who did it, what they did, which part of the system, and when. Every demo seeder uses this, so
 * the data that is loaded never arrives without its history.
 *
 * Rules it follows for you:
 *   - the time is never in the future (a line that would be is moved to a minute ago);
 *   - the wording is the app's own, so the log reads like real use.
 */
class DemoLog
{
    public static function write(?string $userCode, string $action, string $module, string $description, $at): void
    {
        $when = $at instanceof Carbon ? $at->copy() : Carbon::parse($at);
        $limit = now()->subMinute();
        if ($when->greaterThan($limit)) {
            $when = $limit;
        }

        (new ActivityLog())->forceFill([
            'user_code' => $userCode ?: 'SYSTEM',
            'action' => $action,
            'module' => $module,
            'description' => $description,
            'created_at' => $when,
            'updated_at' => $when,
        ])->save();
    }

    /** The Barangay Secretary (Head Staff), who does most of the office work. */
    public static function head(): ?User
    {
        return User::where('is_head_staff', true)->first() ?? User::where('role', 'Staff')->orderBy('id')->first();
    }

    /** All staff accounts, oldest first. */
    public static function staff(): array
    {
        return User::where('role', 'Staff')->orderBy('id')->get()->all();
    }

    public static function name(?User $u): string
    {
        return $u ? trim($u->first_name . ' ' . $u->last_name) : 'Someone';
    }
}

<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\AgeBracket;
use App\Models\CivilStatus;
use App\Models\Event;
use App\Models\EventAttendance;
use App\Models\EventExpense;
use App\Models\Household;
use App\Models\InventoryItem;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class ActivityLogSeeder extends Seeder
{
    /**
     * Realistic audit trail built from the actual rows every seeder above
     * just created -- real staff user_codes, real event/household/item
     * names -- using the exact action/module/description shape each
     * controller\'s own createLog() writes (Households, Events, Inventory,
     * Budget, QR, User, Profiling Settings), so the Activity Logs screen
     * reads like a system that has genuinely been in use, not a handful of
     * placeholder rows. Timestamps are backdated to when each real action
     * would plausibly have happened (event creation a bit before its
     * event_start, an expense a few days after the event ended, a QR
     * scan at the attendance row\'s own time_in/time_out) so the log
     * stays in a believable chronological order rather than everything
     * landing at the exact second this seeder ran.
     *
     * Must run last -- it reads back rows every seeder above created.
     */
    public function run(): void
    {
        $staffCodes = User::where('role', 'Staff')->pluck('user_code')->all();
        $actor = fn (int $i) => $staffCodes[$i % max(count($staffCodes), 1)] ?? 'SYSTEM';

        $now = Carbon::now();
        $rows = [];
        $i = 0;

        $push = function (string $userCode, string $action, string $module, string $description, Carbon $at) use (&$rows) {
            $rows[] = [
                'user_code' => $userCode,
                'action' => $action,
                'module' => $module,
                'description' => $description,
                'created_at' => $at,
                'updated_at' => $at,
            ];
        };

        // Profiling Settings -- age brackets & civil statuses are set up
        // first, before anything else can reference them.
        foreach (AgeBracket::orderBy('id')->get() as $bracket) {
            $push($actor($i++), 'Create Age Bracket', 'Profiling Settings', "Created age bracket '{$bracket->label}'", $now->copy()->subDays(95));
        }
        foreach (CivilStatus::orderBy('id')->get() as $status) {
            $push($actor($i++), 'Create Civil Status', 'Profiling Settings', "Created civil status '{$status->label}'", $now->copy()->subDays(95));
        }

        // Users --------------------------------------------------------------
        foreach (User::orderBy('id')->get() as $user) {
            $push($actor($i++), 'Create User', 'User', "Created user {$user->user_code}", $now->copy()->subDays(rand(88, 93)));
        }

        // Households -----------------------------------------------------------
        foreach (Household::orderBy('id')->get() as $household) {
            $at = $household->created_at ?? $now->copy()->subDays(rand(80, 87));
            $push($actor($i++), 'Create', 'Households', "Created household '{$household->code}'", $at);
        }

        // Events -----------------------------------------------------------------
        foreach (Event::orderBy('event_start')->get() as $event) {
            $eventStart = Carbon::parse($event->event_start);
            $createdAt = $eventStart->lessThan($now)
                ? $eventStart->copy()->subDays(rand(5, 12))
                : $now->copy()->subDays(rand(1, 6));
            $push($actor($i++), 'Create', 'Events', "Created event: {$event->name}", $createdAt);
        }

        // Inventory ----------------------------------------------------------------
        foreach (InventoryItem::orderBy('id')->get() as $item) {
            $push($actor($i++), 'Create', 'Inventory', "Added inventory item: {$item->name}", $now->copy()->subDays(rand(75, 90)));
        }

        // Budget expenses ---------------------------------------------------------
        foreach (EventExpense::with('event')->get() as $expense) {
            if (!$expense->event) {
                continue;
            }
            $eventEnd = Carbon::parse($expense->event->event_end ?? $expense->event->event_start);
            $at = $eventEnd->copy()->addDays(rand(1, 3));
            if ($at->greaterThan($now)) {
                $at = $now->copy()->subHours(rand(1, 24));
            }
            $amount = number_format((float) $expense->amount, 2);
            $push($actor($i++), 'Create', 'Budget', "Recorded expense '{$expense->item}' (PHP {$amount}) for event: {$expense->event->name}", $at);
        }

        // QR check-ins/check-outs -- attributed to staff (the scanner is
        // staff-operated), timestamped at the attendance row\'s own real
        // time_in/time_out so the log stays in true chronological order.
        foreach (EventAttendance::whereNotNull('time_in')->with(['user', 'event'])->get() as $attendance) {
            if (!$attendance->user || !$attendance->event) {
                continue;
            }
            $userName = trim($attendance->user->first_name . ' ' . $attendance->user->last_name);

            $push($actor($i), 'Time In', 'QR', "{$userName} signed in to {$attendance->event->name}", Carbon::parse($attendance->time_in));
            $i++;

            if ($attendance->time_out) {
                $push($actor($i), 'Time Out', 'QR', "{$userName} signed out of {$attendance->event->name}", Carbon::parse($attendance->time_out));
                $i++;
            }
        }

        $rows[] = [
            'user_code' => 'SYSTEM',
            'action' => 'Database Seed',
            'module' => 'System',
            'description' => 'Demo data seeded for users, households, events, attendance, budget, inventory, and feedback.',
            'created_at' => $now,
            'updated_at' => $now,
        ];

        // Chronological order, oldest first -- matches how the real log
        // fills up over time rather than seeding-order.
        usort($rows, fn ($a, $b) => $a['created_at'] <=> $b['created_at']);

        foreach (array_chunk($rows, 500) as $chunk) {
            ActivityLog::insert($chunk);
        }
    }
}

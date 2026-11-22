<?php

namespace App\Console\Commands;

use App\Support\AttendanceLedger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Checks every attendance row against the attendance scan ledger (see App\Support\AttendanceLedger).
 *
 *   php artisan attendance:reconcile           reports rows whose times or status do not match the ledger (reads only)
 *   php artisan attendance:reconcile --adopt   writes the scans of rows that pre-date the ledger down as explicit
 *                                              entries (user SYSTEM)
 */
class AttendanceReconcile extends Command
{
    protected $signature = 'attendance:reconcile {--adopt : Record the scans of rows that pre-date the ledger} {--force : Do not ask before adopting}';

    protected $description = 'Check that every attendance row matches the scan ledger';

    public function handle(): int
    {
        $problems = AttendanceLedger::check();

        if (!$problems) {
            $this->info('Every attendance row matches the scan ledger.');

            return self::SUCCESS;
        }

        $events = DB::table('events')->whereIn('id', array_unique(array_column($problems, 'event_id')))->pluck('name', 'id');
        $users = DB::table('users')->whereIn('id', array_unique(array_column($problems, 'user_id')))->get(['id', 'user_code', 'first_name', 'last_name'])->keyBy('id');

        $this->error(count($problems) . ' attendance row(s) do not match the ledger:');
        $this->table(['Event', 'Person', 'Problem'], array_map(function ($p) use ($events, $users) {
            $u = $users[$p['user_id']] ?? null;

            return [
                '#' . $p['event_id'] . ' ' . ($events[$p['event_id']] ?? '?'),
                $u ? "{$u->user_code} {$u->first_name} {$u->last_name}" : '#' . $p['user_id'],
                $p['problem'],
            ];
        }, $problems));

        $adoptable = count(array_filter($problems, fn ($p) => $p['adopt']));

        if (!$this->option('adopt')) {
            if ($adoptable) {
                $this->line("{$adoptable} of these are scans with no ledger entry. Run with --adopt to write them down, if they pre-date the ledger.");
            }

            return self::FAILURE;
        }

        if (!$adoptable) {
            $this->line('Nothing here can be adopted: every difference is a real mismatch to investigate.');

            return self::FAILURE;
        }

        if (!$this->option('force') && !$this->confirm("Record {$adoptable} scan(s) as ledger entries (user SYSTEM)? Only do this for scans you know were made before the ledger existed.")) {
            return self::FAILURE;
        }

        $written = AttendanceLedger::adopt();
        $this->info("{$written} opening entr" . ($written === 1 ? 'y' : 'ies') . ' written.');
        $left = count(AttendanceLedger::check());
        $left ? $this->error("{$left} difference(s) still need investigating.") : $this->info('Every attendance row now matches the scan ledger.');

        return $left ? self::FAILURE : self::SUCCESS;
    }
}

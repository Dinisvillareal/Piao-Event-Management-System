<?php

namespace App\Console\Commands;

use App\Support\AuditChain;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

/**
 * Checks the activity log, the report history and the inventory ledger for tampering (see App\Support\AuditChain).
 *
 *   php artisan log:verify            walks all three and names the rows that were edited, removed or added by hand
 *   php artisan log:verify --anchor   when a table is intact, also saves a checkpoint (its newest row), so that rows
 *                                     later cut off the end are caught as well
 *
 * It only reads; it changes nothing except the checkpoint files when asked to.
 */
class LogVerify extends Command
{
    protected $signature = 'log:verify {--anchor : Save the newest row of each intact table as a checkpoint}';

    protected $description = 'Check the activity log, the report history and the inventory ledger for edited, removed or hand-added rows';

    private const TITLES = ['activity_logs' => 'Activity log', 'generated_reports' => 'Report history', 'inventory_unit_logs' => 'Inventory ledger'];

    public function handle(): int
    {
        $failed = false;

        foreach (array_keys(AuditChain::TABLES) as $table) {
            $failed = !$this->verify($table) || $failed;
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function verify(string $table): bool
    {
        $title = self::TITLES[$table] ?? $table;

        if (!Schema::hasColumn($table, 'row_hash')) {
            $this->newLine();
            $this->line("== {$title} ==");
            $this->warn('Not set up yet: run php artisan migrate.');

            return true;
        }

        $r = AuditChain::check($table);

        $this->newLine();
        $this->line("== {$title} ==");
        $this->line("Rows:                    {$r['rows']}");
        $this->line("Protected by the chain: {$r['chained']}");
        $this->line("Older, before the chain: {$r['unchained']}");
        if ($r['anchor']) {
            $this->line("Checkpoint:             row #{$r['anchor']['id']}, saved {$r['anchor']['saved_at']}");
        }

        if ($r['problems']) {
            $this->error("TAMPERING DETECTED in the " . strtolower($title) . ". It does not match its fingerprints:");
            foreach (array_slice($r['problems'], 0, 25) as $p) {
                $this->line("  Row #{$p['id']} {$p['problem']}");
            }
            if (count($r['problems']) > 25) {
                $this->line('  ... and ' . (count($r['problems']) - 25) . ' more.');
            }

            return false;
        }

        $this->info($r['chained']
            ? "The " . strtolower($title) . " is intact: every protected row matches its fingerprint and follows the one before it."
            : "No row of the " . strtolower($title) . " is protected by the chain yet (new rows will be).");

        if ($this->option('anchor') && $r['head']) {
            file_put_contents(AuditChain::anchorPath($table), json_encode(['id' => $r['head']['id'], 'hash' => $r['head']['hash'], 'saved_at' => now()->toDateTimeString()]));
            $this->line("Checkpoint saved at row #{$r['head']['id']}.");
        }

        return true;
    }
}

<?php

namespace App\Console\Commands;

use App\Support\StockLedger;
use Illuminate\Console\Command;

/**
 * Checks every inventory item's stock against its ledger (see App\Support\StockLedger).
 *
 *   php artisan stock:reconcile           reports items whose stock does not match their ledger (reads only)
 *   php artisan stock:reconcile --adopt   writes each difference down as an explicit ledger entry (user SYSTEM),
 *                                         for items that existed before the ledger
 */
class StockReconcile extends Command
{
    protected $signature = 'stock:reconcile {--adopt : Record each difference as an opening-balance ledger entry} {--force : Do not ask before adopting}';

    protected $description = 'Check that every inventory item\'s stock matches its ledger';

    public function handle(): int
    {
        $problems = StockLedger::check();

        if (!$problems) {
            $this->info('Every item\'s stock matches its ledger.');

            return self::SUCCESS;
        }

        $this->error(count($problems) . ' item(s) do not match their ledger:');
        $this->table(
            ['#', 'Item', 'In stock', 'On loan', 'Lost', 'Units owned', 'Ledger says', 'Lost per ledger'],
            array_map(fn ($p) => [$p['id'], $p['name'], $p['stock'], $p['on_loan'], $p['lost'], $p['owned'], $p['expected_owned'], $p['expected_lost']], $problems)
        );

        if (!$this->option('adopt')) {
            $this->line('Run with --adopt to write each difference down as an opening-balance entry, if these items pre-date the ledger.');

            return self::FAILURE;
        }

        if (!$this->option('force') && !$this->confirm('Record these differences as ledger entries (user SYSTEM)? Only do this for items you know pre-date the ledger.')) {
            return self::FAILURE;
        }

        $written = StockLedger::adopt();
        $this->info("{$written} opening-balance entr" . ($written === 1 ? 'y' : 'ies') . ' written.');

        return self::SUCCESS;
    }
}

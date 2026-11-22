<?php

namespace Database\Seeders;

use App\Support\StockLedger;
use Illuminate\Database\Seeder;

class InventoryLedgerSeeder extends Seeder
{
    /**
     * The demo inventory is created by setting its numbers directly, so it has no ledger yet. This writes each
     * item's opening balance (user SYSTEM) so that every item reconciles with its ledger from the start, the way
     * a real item added through the app does. Must run after every seeder that changes stock.
     */
    public function run(): void
    {
        StockLedger::adopt();
    }
}

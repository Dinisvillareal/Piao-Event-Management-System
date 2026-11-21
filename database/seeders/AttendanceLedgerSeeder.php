<?php

namespace Database\Seeders;

use App\Support\AttendanceLedger;
use Illuminate\Database\Seeder;

class AttendanceLedgerSeeder extends Seeder
{
    /**
     * The demo attendance rows are written directly with their times, so they have no scans in the ledger yet.
     * This writes those scans as explicit opening entries (user SYSTEM, source "system") so that every row
     * reconciles with the ledger from the start, the way a row scanned through the app does.
     * Must run after EventAttendanceSeeder.
     */
    public function run(): void
    {
        AttendanceLedger::adopt();
    }
}

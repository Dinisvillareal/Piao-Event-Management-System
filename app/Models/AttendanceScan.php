<?php

namespace App\Models;

use App\Models\Concerns\JoinsHashChain;
use Illuminate\Database\Eloquent\Model;

/**
 * One entry of the attendance scan ledger: a real sign-in ("in"), sign-out ("out"), or the voiding of the scans of a
 * person for an event ("void"). Add-only (migration 2026_11_19_000022) and part of a hash chain, so an entry cannot
 * be edited, removed or planted without `php artisan log:verify` naming it. `attendances` is the summary of this ledger.
 */
class AttendanceScan extends Model
{
    use JoinsHashChain;

    /** The ledger records when an entry was added and nothing else ever changes. */
    public const UPDATED_AT = null;

    protected $fillable = ['event_id', 'user_id', 'kind', 'scanned_at', 'source', 'recorded_by', 'note'];

    /** The chain fingerprints are for verification only; they never leave the server in a response. */
    protected $hidden = ['prev_hash', 'row_hash'];

    protected $casts = ['scanned_at' => 'datetime'];
}

<?php

namespace App\Models;

use App\Models\Concerns\JoinsHashChain;
use Illuminate\Database\Eloquent\Model;

/**
 * One row of the Report History: who produced which report, when, with which filters, and the figures it held.
 * Add-only (migration 2026_11_19_000020) and part of a hash chain, so a row cannot be edited, removed or
 * planted without `php artisan log:verify` naming it.
 */
class GeneratedReport extends Model
{
    use JoinsHashChain;

    protected $fillable = ['user_code', 'type', 'format', 'title', 'scope_label', 'filters', 'sections'];

    /** The chain fingerprints are for verification only; they never leave the server in a response. */
    protected $hidden = ['prev_hash', 'row_hash'];

    protected $casts = [
        'filters' => 'array',
        'sections' => 'array',
    ];
}

<?php

namespace App\Models\Concerns;

use App\Support\AuditChain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A new row joins its table's hash chain (App\Support\AuditChain): it stores the fingerprint of the row
 * before it and its own. The read of the previous row and the insert happen in one transaction with the
 * previous row locked, so two requests at the same moment cannot both follow the same row.
 *
 * The model can define beforeChain() to fill in system values (such as an IP address) before the
 * fingerprint is calculated.
 */
trait JoinsHashChain
{
    private static array $chainColumnsPresent = [];

    protected function performInsert(Builder $query)
    {
        $table = $this->getTable();
        self::$chainColumnsPresent[$table] ??= Schema::hasColumn($table, 'row_hash');
        if (!self::$chainColumnsPresent[$table]) {
            return parent::performInsert($query);   // the chain columns have not been added yet (migration not run)
        }

        return DB::transaction(function () use ($query, $table) {
            if (method_exists($this, 'beforeChain')) {
                $this->beforeChain();
            }
            $this->updateTimestamps();   // the time is part of the fingerprint, so it is fixed before it is calculated

            $last = DB::table($table)->orderByDesc('id')->lockForUpdate()->first(['row_hash']);
            $previous = $last->row_hash ?? null;

            $this->setAttribute('prev_hash', $previous ?? '');
            $this->setAttribute('row_hash', AuditChain::fingerprint($previous, $this->getAttributes(), $table));

            return parent::performInsert($query);
        });
    }
}

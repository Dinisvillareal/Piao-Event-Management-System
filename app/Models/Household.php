<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Household extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'code',
        'address',
        'contact_number',
        'deleted_by',
    ];

    // =====================
    // RELATIONSHIPS
    // =====================

    public function members()
    {
        return $this->hasMany(User::class, 'household_id');
    }

    public function head()
    {
        // Convenience accessor -- the member flagged is_household_head, if any.
        return $this->hasOne(User::class, 'household_id')->where('is_household_head', true);
    }

    // =====================
    // HEAD / RESIDENT SYNC
    // =====================

    /**
     * Fills in this household's own address/contact number from a member
     * who's just been made its head, but only whichever of the two is
     * still blank -- an address or SMS number staff already typed
     * directly into the household (e.g. on the Add Household form)
     * always wins and is never overwritten by this. Once a household DOES
     * have its own address/contact number, editing those (see
     * HouseholdController::update()) is what keeps the head's own
     * Residents-page record in sync going forward, not this method.
     */
    public function backfillFromHead(User $head): void
    {
        $dirty = false;

        if (!$this->address && $head->address) {
            $this->address = $head->address;
            $dirty = true;
        }

        if (!$this->contact_number && $head->contact_number) {
            $this->contact_number = $head->contact_number;
            $dirty = true;
        }

        if ($dirty) {
            $this->save();
        }
    }

    // =====================
    // CODE GENERATION
    // =====================

    /**
     * Sequential HH-0001 style code, same pattern as the user_code
     * generator in UserController -- next number after the highest
     * existing one, zero-padded to 4 digits.
     */
    public static function generateCode(): string
    {
        // withTrashed() is required here -- an archived (soft-deleted)
        // household's row (and its HH-#### code) still exists in the
        // table, it just doesn't show up in a default query. Without
        // this, generating the "next" code off the last non-deleted
        // household re-derives a number that was already used and
        // hits the households_code_unique constraint the moment the
        // most-recently-created household happens to be an archived
        // one (same class of bug UserController::store() already
        // guards against for user_code).
        $last = self::withTrashed()->orderByDesc('id')->first();
        $nextNum = $last ? ((int) str_replace('HH-', '', $last->code) + 1) : 1;

        return 'HH-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);
    }
}

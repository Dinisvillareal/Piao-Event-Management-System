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
        'dissolved_members',
    ];

    protected $casts = [
        'dissolved_members' => 'array',
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

    /**
     * Deleting a household unlinks its members. This remembers who they were
     * (see HouseholdController::destroy), and restoring the household from the
     * Archive calls this to put them back -- but only those who are still free:
     * anyone who joined another household or was archived in the meantime is
     * left where they are. The old head becomes head again only if still free.
     *
     * @return array{linked:int, skipped:int}
     */
    public function relinkDissolvedMembers(): array
    {
        $snap = $this->dissolved_members;
        if (!is_array($snap) || empty($snap['members'])) {
            return ['linked' => 0, 'skipped' => 0];
        }

        $ids = array_map('intval', $snap['members']);

        // The conditional update is the claim: someone grabbed by another household
        // a moment ago simply isn't counted.
        $linked = User::whereIn('id', $ids)
            ->whereNull('household_id')
            ->whereNull('deleted_at')
            ->whereIn('role', ['Resident', 'Staff'])
            ->update(['household_id' => $this->id, 'is_household_head' => false]);

        $headId = isset($snap['head']) ? (int) $snap['head'] : 0;
        if ($headId > 0) {
            User::where('id', $headId)->where('household_id', $this->id)->update(['is_household_head' => true]);
        }

        $this->dissolved_members = null;
        $this->save();

        return ['linked' => $linked, 'skipped' => count($ids) - $linked];
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

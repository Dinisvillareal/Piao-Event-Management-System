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
    // CODE GENERATION
    // =====================

    /**
     * Sequential HH-0001 style code, same pattern as the user_code
     * generator in UserController -- next number after the highest
     * existing one, zero-padded to 4 digits.
     */
    public static function generateCode(): string
    {
        $last = self::orderByDesc('id')->first();
        $nextNum = $last ? ((int) str_replace('HH-', '', $last->code) + 1) : 1;

        return 'HH-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);
    }
}

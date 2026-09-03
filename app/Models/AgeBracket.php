<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class AgeBracket extends Model
{
    use SoftDeletes;

    protected $fillable = ['label', 'min_age', 'max_age', 'sort_order'];

    protected $casts = [
        'min_age'    => 'integer',
        'max_age'    => 'integer',
        'sort_order' => 'integer',
    ];

    /**
     * Staff-configurable replacement for the old hardcoded
     * Child/Youth/Adult/Senior Citizen bands (Settings → Profiling).
     *
     * Uses a plain per-request static cache (NOT Laravel's Cache facade) --
     * this project has no `cache` table migration, so Cache::remember()
     * would throw on the "database" cache store used in .env.
     */
    private static ?\Illuminate\Support\Collection $cached = null;

    public static function allCached()
    {
        if (self::$cached === null) {
            self::$cached = self::orderBy('sort_order')->orderBy('min_age')->get();
        }
        return self::$cached;
    }

    public static function forgetCache(): void
    {
        self::$cached = null;
    }

    /**
     * Resolve which bracket a given age falls into, using the
     * currently configured ranges instead of hardcoded if/else.
     */
    public static function resolveForAge(?int $age): ?self
    {
        if ($age === null) {
            return null;
        }

        foreach (self::allCached() as $bracket) {
            $withinMin = $age >= $bracket->min_age;
            $withinMax = $bracket->max_age === null || $age <= $bracket->max_age;
            if ($withinMin && $withinMax) {
                return $bracket;
            }
        }

        return null;
    }

    public function memberships()
    {
        return $this->hasMany(Membership::class, 'eligible_age_bracket_id');
    }
}

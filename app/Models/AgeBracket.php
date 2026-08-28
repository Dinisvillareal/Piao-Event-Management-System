<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class AgeBracket extends Model
{
    protected $fillable = ['label', 'min_age', 'max_age', 'sort_order'];

    protected $casts = [
        'min_age'    => 'integer',
        'max_age'    => 'integer',
        'sort_order' => 'integer',
    ];

    const CACHE_KEY = 'age_brackets.all';

    /**
     * Staff-configurable replacement for the old hardcoded
     * Child/Youth/Adult/Senior Citizen bands (Settings → Profiling).
     */
    public static function allCached()
    {
        return Cache::remember(self::CACHE_KEY, 3600, function () {
            return self::orderBy('sort_order')->orderBy('min_age')->get();
        });
    }

    public static function forgetCache(): void
    {
        Cache::forget(self::CACHE_KEY);
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

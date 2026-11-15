<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class AgeBracket extends Model
{
    use SoftDeletes;

    protected $fillable = ['label', 'min_age', 'max_age', 'sort_order', 'deleted_by'];

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

    /** The original fixed bands, used only while no age bracket has been configured. */
    private const LEGACY_BANDS = [
        'child'          => ['Child', 0, 12],
        'youth'          => ['Youth', 13, 17],
        'adult'          => ['Adult', 18, 59],
        'senior'         => ['Senior Citizen', 60, null],
        'senior citizen' => ['Senior Citizen', 60, null],
    ];

    /**
     * Narrow a users query to the people who fall in one age group, where the
     * group is named by its label (matched ignoring upper/lower case). Built
     * from birth dates, so it behaves the same on MySQL, MariaDB and SQLite.
     * An unknown group matches nobody. Shared by the Residents list and the
     * Reports, so both always agree on who is in which group.
     */
    public static function applyToUserQuery($query, string $label): void
    {
        $label = trim($label);
        $brackets = self::allCached();
        $inRange = function ($q, ?int $min, ?int $max) {
            // age >= min  <=>  born on or before today minus min years;
            // age <= max  <=>  born after today minus (max + 1) years.
            $q->whereNotNull('birth_date')->where('birth_date', '<=', now()->subYears($min ?? 0)->toDateString());
            if ($max !== null) {
                $q->where('birth_date', '>', now()->subYears($max + 1)->toDateString());
            }
        };

        $target = $brackets->first(fn ($b) => mb_strtolower($b->label) === mb_strtolower($label));
        if ($target) {
            $query->where(function ($q) use ($brackets, $target, $inRange) {
                $inRange($q, $target->min_age, $target->max_age);
                // A person who fits an earlier bracket belongs to that one (see resolveForAge).
                foreach ($brackets as $earlier) {
                    if ($earlier->id === $target->id) {
                        break;
                    }
                    $q->whereNot(fn ($n) => $inRange($n, $earlier->min_age, $earlier->max_age));
                }
            });

            return;
        }

        if ($brackets->isEmpty() && isset(self::LEGACY_BANDS[mb_strtolower($label)])) {
            [, $min, $max] = self::LEGACY_BANDS[mb_strtolower($label)];
            $query->where(fn ($q) => $inRange($q, $min, $max));

            return;
        }

        $query->whereRaw('1 = 0');
    }

    /**
     * The age groups in display order, each as [label, min age, max age or null]:
     * the staff-set brackets, or the original four bands if none are set.
     *
     * @return array<int, array{0: string, 1: int, 2: ?int}>
     */
    public static function groupInfo(): array
    {
        $brackets = self::allCached();
        if ($brackets->isNotEmpty()) {
            return $brackets->map(fn ($b) => [$b->label, (int) $b->min_age, $b->max_age === null ? null : (int) $b->max_age])->all();
        }

        return [['Child', 0, 12], ['Youth', 13, 17], ['Adult', 18, 59], ['Senior Citizen', 60, null]];
    }

    /** Just the labels of groupInfo(). */
    public static function groupLabels(): array
    {
        return array_column(self::groupInfo(), 0);
    }

    /** Which age group an age belongs to, or null when no group covers it. */
    public static function labelForAge(?int $age): ?string
    {
        if ($age === null) {
            return null;
        }
        if (self::allCached()->isNotEmpty()) {
            return self::resolveForAge($age)?->label;
        }
        foreach (['child', 'youth', 'adult', 'senior'] as $key) {
            [$name, $min, $max] = self::LEGACY_BANDS[$key];
            if ($age >= $min && ($max === null || $age <= $max)) {
                return $name;
            }
        }

        return null;
    }

    public function memberships()
    {
        return $this->belongsToMany(Membership::class, 'membership_age_bracket', 'age_bracket_id', 'membership_id');
    }
}

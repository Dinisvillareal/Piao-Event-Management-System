<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CurrentStatus extends Model
{
    use SoftDeletes;

    protected $fillable = ['label', 'sort_order', 'deleted_by'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    /**
     * Plain per-request static cache (NOT Laravel's Cache facade) -- this
     * project has no `cache` table migration, so Cache::remember() would
     * throw on the "database" cache store used in .env.
     */
    private static ?\Illuminate\Support\Collection $cached = null;

    public static function allCached()
    {
        if (self::$cached === null) {
            self::$cached = self::orderBy('sort_order')->get();
        }
        return self::$cached;
    }

    public static function forgetCache(): void
    {
        self::$cached = null;
    }

    public function users()
    {
        return $this->belongsToMany(User::class, 'current_status_user');
    }

    public function memberships()
    {
        return $this->hasMany(Membership::class, 'eligible_current_status_id');
    }
}

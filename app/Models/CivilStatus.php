<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class CivilStatus extends Model
{
    protected $fillable = ['label', 'sort_order'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    const CACHE_KEY = 'civil_statuses.all';

    public static function allCached()
    {
        return Cache::remember(self::CACHE_KEY, 3600, function () {
            return self::orderBy('sort_order')->get();
        });
    }

    public static function forgetCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function memberships()
    {
        return $this->hasMany(Membership::class, 'eligible_civil_status_id');
    }
}

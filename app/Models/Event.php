<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Event extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'name',
        'description',
        'location',
        'event_start',
        'event_end',
        'membership_ids',
    ];

    protected $casts = [
        'membership_ids' => 'array',
    ];

    public function setMembershipIdsAttribute($value)
    {
        $ids = collect($value)
            ->filter()
            ->map(function ($id) {
                return is_numeric($id) ? (int) $id : null;
            })
            ->filter()
            ->values()
            ->all();

        $this->attributes['membership_ids'] = json_encode($ids);
    }

    public function attendances()
    {
        return $this->hasMany(EventAttendance::class);
    }

    /**
     * Returns the Membership models whose IDs are stored in the JSON column.
     * Usage: $event->memberships  →  Collection of Membership
     */
    public function getMembershipsAttribute()
    {
        $ids = $this->membership_ids ?? [];

        if (empty($ids)) {
            return collect();
        }

        return Membership::whereIn('id', $ids)->get();
    }
}
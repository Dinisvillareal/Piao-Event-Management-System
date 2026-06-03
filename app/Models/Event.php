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
        'notification_message',
    ];

    protected $casts = [
        'membership_ids' => 'array',
        'event_start' => 'datetime',
        'event_end' => 'datetime',
    ];

    private $_cachedMemberships = null;
    private $_cachedNotificationTarget = null;
    private $_cachedFormattedNotification = null;
    private $_cachedFormattedUpdatedNotification = null;

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
        
        $this->_cachedMemberships = null;
        $this->_cachedNotificationTarget = null;
        $this->_cachedFormattedNotification = null;
        $this->_cachedFormattedUpdatedNotification = null;
    }

    public function attendances()
    {
        return $this->hasMany(EventAttendance::class);
    }

    public function getMembershipsAttribute()
    {
        if ($this->_cachedMemberships !== null) {
            return $this->_cachedMemberships;
        }
        
        $ids = $this->membership_ids ?? [];
        if (empty($ids)) {
            $this->_cachedMemberships = collect();
            return $this->_cachedMemberships;
        }

        $this->_cachedMemberships = Membership::whereIn('id', $ids)->get();
        return $this->_cachedMemberships;
    }

    public function getNotificationTargetAttribute()
    {
        if ($this->_cachedNotificationTarget !== null) {
            return $this->_cachedNotificationTarget;
        }
        
        $ids = $this->membership_ids ?? [];
        
        if (empty($ids)) {
            $this->_cachedNotificationTarget = 'All Residents';
            return $this->_cachedNotificationTarget;
        }
        
        $memberships = $this->memberships;
        if ($memberships->count() === 1) {
            $this->_cachedNotificationTarget = $memberships->first()->name . ' Members';
            return $this->_cachedNotificationTarget;
        }
        
        $this->_cachedNotificationTarget = $memberships->pluck('name')->join(', ');
        return $this->_cachedNotificationTarget;
    }

    public function getFormattedNotificationAttribute()
    {
        if ($this->_cachedFormattedNotification !== null) {
            return $this->_cachedFormattedNotification;
        }
        
        $target = $this->notification_target;
        $message = $this->notification_message ?? 'New event announced';
        $this->_cachedFormattedNotification = "To: {$target} • {$this->name} • {$message}";
        return $this->_cachedFormattedNotification;
    }

    public function getFormattedUpdatedNotificationAttribute()
    {
        if ($this->_cachedFormattedUpdatedNotification !== null) {
            return $this->_cachedFormattedUpdatedNotification;
        }
        
        $target = $this->notification_target;
        $message = $this->notification_message ?? 'Event details updated';
        $this->_cachedFormattedUpdatedNotification = "✏️ UPDATED: To: {$target} • {$this->name} • {$message}";
        return $this->_cachedFormattedUpdatedNotification;
    }

    public function notifications()
    {
        return $this->hasMany(Notification::class);
    }
    
    public function clearCache()
    {
        $this->_cachedMemberships = null;
        $this->_cachedNotificationTarget = null;
        $this->_cachedFormattedNotification = null;
        $this->_cachedFormattedUpdatedNotification = null;
    }

    // ✅ ADD THESE NEW METHODS FOR ATTENDANCE MANAGEMENT
    
    /**
     * Get all residents eligible for this event
     */
    public function getEligibleResidents()
    {
        $membershipIds = $this->membership_ids ?? [];
        
        if (empty($membershipIds)) {
            return User::where('role', 'Resident')->get();
        }
        
        return User::where('role', 'Resident')
            ->whereHas('memberships', function ($query) use ($membershipIds) {
                $query->whereIn('membership_id', $membershipIds);
            })
            ->get();
    }
    
    /**
     * Create attendance records for all eligible residents (status = 'missed')
     */
    public function createAttendanceRecords()
    {
        $residents = $this->getEligibleResidents();
        $now = now();
        
        $records = [];
        foreach ($residents as $resident) {
            $records[] = [
                'event_id' => $this->id,
                'user_id' => $resident->id,
                'time_in' => null,
                'time_out' => null,
                'status' => 'missed',
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        
        if (!empty($records)) {
            EventAttendance::insert($records);
        }
        
        return count($records);
    }
    
    /**
     * Sync attendance records when membership changes
     */
    public function syncAttendanceRecords()
    {
        $eligibleResidentIds = $this->getEligibleResidents()->pluck('id')->toArray();
        $existingResidentIds = $this->attendances()->pluck('user_id')->toArray();
        
        // Add records for new eligible residents
        $newResidentIds = array_diff($eligibleResidentIds, $existingResidentIds);
        foreach ($newResidentIds as $residentId) {
            EventAttendance::create([
                'event_id' => $this->id,
                'user_id' => $residentId,
                'time_in' => null,
                'time_out' => null,
                'status' => 'missed'
            ]);
        }
        
        // Remove records for residents no longer eligible
        $removedResidentIds = array_diff($existingResidentIds, $eligibleResidentIds);
        if (!empty($removedResidentIds)) {
            $this->attendances()->whereIn('user_id', $removedResidentIds)->delete();
        }
    }

    protected function serializeDate(\DateTimeInterface $date)
    {
        return $date->format('Y-m-d H:i:s');
    }
}
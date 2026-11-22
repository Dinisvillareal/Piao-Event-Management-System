<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;  // ✅ NEW: Add this import

class Event extends Model
{
    use HasFactory, SoftDeletes;  // ✅ NEW: Add SoftDeletes trait

    public $timestamps = false;  // Keep as is - events don't track created_at/updated_at

    protected $fillable = [
        'name',
        'description',
        'location',
        'event_start',
        'event_end',
        'call_time_start',
        'call_time_end',
        'membership_ids',
        'notification_message',
        'deleted_by',
        'approved_budget',
        'posted_to_facebook',
    ];

    protected $casts = [
        'membership_ids' => 'array',
        'event_start' => 'datetime',
        'event_end' => 'datetime',
        'call_time_start' => 'datetime',
        'call_time_end' => 'datetime',
        'approved_budget' => 'decimal:2',
        'posted_to_facebook' => 'boolean',
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

    /**
     * A venue name reduced to its letters and digits, so "Covered Court", "covered  court",
     * "Covered-Court." and "coveredcourt" are all the same place.
     */
    public static function normalizeVenue(?string $venue): string
    {
        $v = mb_strtolower((string) $venue);
        $v = preg_replace('/[^\p{L}\p{N}]+/u', '', $v);

        return (string) $v;
    }

    /**
     * The event that already occupies this venue during the given time, or null when it is free.
     *
     * A venue is occupied from the moment people gather (the call time, when sign-in opens) until
     * the event ends, not only from the printed start time, so an event whose sign-in opens at
     * 6:00 for a 7:00 start still blocks a 6:30 event in the same place. Back-to-back is fine:
     * one event ending at 9:00 does not block another that starts gathering at 9:00.
     *
     * Venue names are compared without caring about capitals, spaces or punctuation.
     */
    public static function venueConflict(?string $venue, $callStart, $start, $end, ?int $exceptId = null): ?self
    {
        $wanted = self::normalizeVenue($venue);
        if ($wanted === '' || !$start || !$end) {
            return null;
        }

        $start = \Illuminate\Support\Carbon::parse($start);
        $end = \Illuminate\Support\Carbon::parse($end);
        $from = $callStart ? \Illuminate\Support\Carbon::parse($callStart) : $start;
        if ($from->gt($start)) {
            $from = $start;
        }

        $occupiedFrom = 'CASE WHEN call_time_start IS NOT NULL AND call_time_start < event_start THEN call_time_start ELSE event_start END';

        return self::withoutTrashed()
            ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
            ->whereRaw("($occupiedFrom) < ?", [$end->toDateTimeString()])
            ->where('event_end', '>', $from->toDateTimeString())
            ->orderBy('event_start')
            ->get()
            ->first(fn (self $e) => self::normalizeVenue($e->location) === $wanted);
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

    // ===== UC-8: Record Event Budget and Expenses =====

    public function expenses()
    {
        return $this->hasMany(EventExpense::class);
    }

    // ===== Items borrowed from Inventory for this event =====

    public function borrowedItems()
    {
        return $this->hasMany(EventInventoryItem::class);
    }

    public function getTotalExpensesAttribute(): float
    {
        return (float) $this->expenses()->sum('amount');
    }

    public function getIsOverBudgetAttribute(): bool
    {
        if ($this->approved_budget === null) {
            return false;
        }

        return $this->total_expenses > (float) $this->approved_budget;
    }

    // ===== UC-16: Submit Post-Event Feedback =====

    public function feedback()
    {
        return $this->hasMany(Feedback::class);
    }

    public function getAverageRatingAttribute(): ?float
    {
        $avg = $this->feedback()->avg('rating');
        return $avg !== null ? round((float) $avg, 1) : null;
    }

    public function clearCache()
    {
        $this->_cachedMemberships = null;
        $this->_cachedNotificationTarget = null;
        $this->_cachedFormattedNotification = null;
        $this->_cachedFormattedUpdatedNotification = null;
    }

    public function getEligibleResidents()
    {
        $membershipIds = $this->membership_ids ?? [];

        // Staff are barangay residents too: an open ("All Residents") event
        // includes them, and a membership-targeted event includes any staff
        // member who is enrolled in that membership.
        if (empty($membershipIds)) {
            return User::whereIn('role', ['Resident', 'Staff'])->get();
        }

        return User::whereIn('role', ['Resident', 'Staff'])
            ->whereHas('memberships', function ($query) use ($membershipIds) {
                $query->whereIn('membership_id', $membershipIds);
            })
            ->get();
    }

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
     * Additive only: creates the missing 'missed' rows for anyone currently
     * eligible (e.g. staff on events created before staff counted as
     * eligible) and never removes or edits an existing row.
     */
    /**
     * True once the event is over: money records (budget, expenses) are locked from then on.
     * One rule, used by the expense screens and by the Archive's restore.
     */
    public function hasEnded(): bool
    {
        $end = $this->event_end ?? $this->call_time_end ?? optional($this->event_start)->copy()->endOfDay();

        return $end !== null && now()->gt($end);
    }

    /**
     * Ids of the people who are eligible for this event but have no attendance
     * row yet (for example a resident registered after the event was posted).
     * Read-only: it never writes anything, so reports can use it safely.
     *
     * @return int[]
     */
    public function missingAttendanceUserIds(): array
    {
        $existingIds = $this->attendances()->pluck('user_id')->toArray();
        $membershipIds = $this->membership_ids ?? [];
        $eligibleQuery = User::whereIn('role', ['Resident', 'Staff']);
        if (!empty($membershipIds)) {
            $eligibleQuery->whereHas('memberships', function ($query) use ($membershipIds) {
                $query->whereIn('membership_id', $membershipIds);
            });
        }
        // Ids only -- avoids hydrating every user model on each attendance load.
        $eligibleIds = $eligibleQuery->pluck('id')->toArray();

        return array_values(array_diff($eligibleIds, $existingIds));
    }

    public function addMissingAttendanceRecords(): int
    {
        $missing = $this->missingAttendanceUserIds();
        $now = now();

        $rows = [];
        foreach ($missing as $userId) {
            $rows[] = [
                'event_id' => $this->id,
                'user_id' => $userId,
                'time_in' => null,
                'time_out' => null,
                'status' => 'missed',
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        if (!empty($rows)) {
            EventAttendance::insert($rows);
        }

        return count($rows);
    }

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

        // Remove records for residents no longer eligible. Deliberate
        // project decision: when an event's targeting changes, anyone no
        // longer on the eligible list is removed ENTIRELY, including
        // residents who already scanned in/out -- no partial "Incomplete"
        // row is left behind on either the Staff or Member side. There's no
        // SoftDeletes on EventAttendance, so this delete is instant and
        // permanent with no Archive/restore. (timeIn()/timeOut() in
        // EventAttendanceController separately block a no-longer-eligible
        // resident from creating a new row after this runs.)
        $removedResidentIds = array_diff($existingResidentIds, $eligibleResidentIds);
        if (!empty($removedResidentIds)) {
            // A scan is never erased silently: its removal is written to the attendance scan ledger first
            // (a "void" entry), which is what lets the database delete a row that holds a scan.
            foreach ($this->attendances()->whereIn('user_id', $removedResidentIds)->get(['user_id', 'time_in', 'time_out']) as $row) {
                if ($row->time_in || $row->time_out) {
                    \App\Support\AttendanceLedger::void($this->id, (int) $row->user_id);
                }
            }
            $this->attendances()->whereIn('user_id', $removedResidentIds)->delete();
        }
    }

    protected function serializeDate(\DateTimeInterface $date)
    {
        return $date->format('Y-m-d H:i:s');
    }
}
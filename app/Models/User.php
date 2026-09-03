<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class User extends Authenticatable
{
    use HasFactory, SoftDeletes;

    public $timestamps = false;

    protected $fillable = [
        'user_code',
        'first_name',
        'last_name',
        'middle_name',
        'contact_number',
        'validation_id',
        'role',
        'password',
        'has_account',
        'deleted_by',
        'birth_date',
        'address',
        'civil_status_id',
        'gender',
        'household_code',
        'is_household_head',
        'household_contact_number',
        'household_id',
        'preferred_language',
    ];

    protected $hidden = [
        'password'
    ];

    protected $casts = [
        'has_account' => 'boolean',
        'is_household_head' => 'boolean',
        'birth_date' => 'date',
    ];

    /**
     * Automatically include in JSON responses
     */
    protected $appends = [
        'validation_id_url',
        'age',
        'age_group',
        'civil_status',
    ];

    // =====================
    // ACCESSOR
    // =====================

    /**
     * Returns:
     * http://127.0.0.1:8000/storage/validation_ids/file.png
     */
    public function getValidationIdUrlAttribute(): ?string
    {
        return $this->validation_id
            ? Storage::disk('public')->url($this->validation_id)
            : null;
    }

    // =====================
    // RELATIONSHIPS
    // =====================

    public function attendances()
    {
        return $this->hasMany(
            EventAttendance::class
        );
    }

    public function memberships()
    {
        return $this->belongsToMany(
            Membership::class,
            'membership_residents',
            'user_id',
            'membership_id'
        );
    }

    public function feedback()
    {
        return $this->hasMany(Feedback::class);
    }

    public function household()
    {
        return $this->belongsTo(Household::class);
    }

    // =====================
    // ADVISER RECOMMENDATION: age profiling ("Filter for Age")
    // =====================

    public function getAgeAttribute(): ?int
    {
        if (!$this->birth_date) {
            return null;
        }

        return $this->birth_date->age;
    }

    /**
     * Buckets used across the Residents filter chips and the Reports
     * age-breakdown chart.
     */
    public function getAgeGroupAttribute(): ?string
    {
        $age = $this->age;

        if ($age === null) {
            return null;
        }

        // Staff-configurable via Settings -> Profiling (Age & Status Categories);
        // falls back to the original fixed bands if none are configured yet.
        $bracket = AgeBracket::resolveForAge($age);
        if ($bracket) {
            return $bracket->label;
        }

        if ($age < 13) return 'Child';
        if ($age < 18) return 'Youth';
        if ($age < 60) return 'Adult';
        return 'Senior Citizen';
    }

    /**
     * Adviser example (Senior Citizen eligibility) extended to a
     * Staff-configurable civil/current status -- covers Solo Parent, etc.
     */
    public function civilStatus()
    {
        return $this->belongsTo(CivilStatus::class);
    }

    public function getCivilStatusAttribute(): ?string
    {
        // Use getRelationValue() (not $this->civilStatus) to avoid Eloquent's
        // studly-case collision between the "civilStatus" relation and this
        // "civil_status" accessor, which would otherwise recurse infinitely.
        return $this->getRelationValue('civilStatus')?->label;
    }
}

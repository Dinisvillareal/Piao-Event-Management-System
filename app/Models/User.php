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
        'deleted_by'
    ];

    protected $hidden = [
        'password'
    ];

    protected $casts = [
        'has_account' => 'boolean',
    ];

    /**
     * Automatically include in JSON responses
     */
    protected $appends = [
        'validation_id_url'
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
}

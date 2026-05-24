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
        'has_account'
    ];

    protected $hidden = [
        'password'
    ];

    protected $casts = [
        'has_account' => 'boolean',
    ];

    // =====================
    // ACCESSOR
    // =====================

    public function getValidationIdUrlAttribute()
    {
        if (!$this->validation_id) {
            return null;
        }

        return Storage::disk('ftp')->url(
            $this->validation_id
        );
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

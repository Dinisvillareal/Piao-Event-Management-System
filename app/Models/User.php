<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;

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
        'role',
        'password',
        'has_account'
    ];

    protected $hidden = [
        'password'
    ];

    // =====================
    // RELATIONSHIPS
    // =====================

    public function attendances()
    {
        return $this->hasMany(EventAttendance::class);
    }

    // 🔥 ADD THIS (VERY IMPORTANT)
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

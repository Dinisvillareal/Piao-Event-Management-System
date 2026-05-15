<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Authenticatable
{
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'user_code', // PR-000001
        'first_name',
        'last_name',
        'middle_name',
        'contact_number',
        'role',
        'password'
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
}

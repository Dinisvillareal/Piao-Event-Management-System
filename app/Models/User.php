<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Authenticatable
{
    use HasFactory;
    
    public $timestamps = false;
    
    protected $fillable = [
        'first_name',
        'last_name',
        'middle_name',
        'contact_number',
        'role'
    ];

    public function account()
    {
        return $this->hasOne(Account::class);
    }

    public function attendances()
    {
        return $this->hasMany(EventAttendance::class);
    }
}


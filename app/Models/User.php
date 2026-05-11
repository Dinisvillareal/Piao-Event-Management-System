<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
Use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Model
{
    use HasFactory;
    public $timestamps = false; // 👈 PUT IT HERE
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
        return $this->hasMany(Attendance::class);
    }
}

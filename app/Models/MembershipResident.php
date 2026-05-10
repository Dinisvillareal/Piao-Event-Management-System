<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MembershipResident extends Model
{
    public $timestamps = false;
    protected $fillable = [
        'user_id',
        'membership_id',
    ];

    // =====================================
    // 🔗 RELATIONSHIP TO USER
    // =====================================
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    // =====================================
    // 🔗 RELATIONSHIP TO MEMBERSHIP
    // =====================================
    public function membership()
    {
        return $this->belongsTo(Membership::class);
    }
}

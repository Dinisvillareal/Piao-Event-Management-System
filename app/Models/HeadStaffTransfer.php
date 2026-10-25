<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HeadStaffTransfer extends Model
{
    protected $fillable = ['from_user_id', 'to_user_id', 'status', 'expires_at'];

    protected $casts = ['expires_at' => 'datetime'];

    public function from()
    {
        return $this->belongsTo(User::class, 'from_user_id')->withTrashed();
    }

    public function to()
    {
        return $this->belongsTo(User::class, 'to_user_id')->withTrashed();
    }
}

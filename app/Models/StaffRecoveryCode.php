<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaffRecoveryCode extends Model
{
    protected $fillable = ['user_id', 'code_hash', 'used_at'];

    protected $hidden = ['code_hash'];

    protected $casts = ['used_at' => 'datetime'];
}

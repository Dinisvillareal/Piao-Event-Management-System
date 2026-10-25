<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SecurityAlert extends Model
{
    protected $fillable = ['user_id', 'type', 'title', 'message', 'read'];

    protected $casts = ['read' => 'boolean'];
}

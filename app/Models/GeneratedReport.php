<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GeneratedReport extends Model
{
    protected $fillable = ['user_code', 'type', 'format', 'title', 'scope_label', 'filters', 'sections'];

    protected $casts = [
        'filters' => 'array',
        'sections' => 'array',
    ];
}

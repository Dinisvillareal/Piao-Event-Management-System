<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IntegrationSetting extends Model
{
    protected $fillable = [
        'key',
        'value',
        'is_enabled',
    ];

    protected $casts = [
        'value' => 'array',
        'is_enabled' => 'boolean',
    ];
}

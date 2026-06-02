<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ActivityLog extends Model
{
    use HasFactory;

    protected $table = 'activity_logs';

    protected $fillable = [
        'user_code',
        'action',
        'module',
        'description',
    ];

    // IMPORTANT: ensure timestamps are enabled
    public $timestamps = true;
}

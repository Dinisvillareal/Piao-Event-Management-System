<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Event extends Model
{
     use HasFactory;

     public $timestamps = false;

    protected $fillable = [
        'name',
        'description',
        'event_start',
        'event_end',
    ];
}

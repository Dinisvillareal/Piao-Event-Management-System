<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class EventAttendance extends Model
{
    use HasFactory;
  protected $table = 'attendances';
    protected $fillable = [
        'event_id',
        'user_id',
        'time_in',
        'time_out',
        'status',
    ];


    public function event()
    {
        return $this->belongsTo(Event::class);
    }
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeedbackEdit extends Model
{
    protected $table = 'feedback_edits';

    protected $fillable = ['kind', 'item_id', 'rating', 'reason', 'comment', 'written_at'];

    protected $casts = ['written_at' => 'datetime'];
}

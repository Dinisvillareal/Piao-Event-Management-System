<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Membership extends Model
{
    protected $fillable = ['name', 'description'];

    public $timestamps = false;

    /**
     * Relationship: A membership can belong to many users.
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(
            User::class, 
            'membership_residents',
            'membership_id',  // Foreign key on pivot table
            'user_id'         // Related key on pivot table
        );
    }
}
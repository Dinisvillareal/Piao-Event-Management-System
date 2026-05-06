<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Membership extends Model
{
    // Allows you to save the name using Membership::create()
    protected $fillable = ['name'];

    /**
     * Relationship: A membership can belong to many users.
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withTimestamps();
    }
}

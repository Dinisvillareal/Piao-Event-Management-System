<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Membership extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'description', 'is_active', 'deactivated_reason','deleted_by'];

    public $timestamps = false;

    protected $casts = [
        'is_active' => 'boolean',  // ✅ ADD THIS
        'deactivated_at' => 'datetime',  // ✅ ADD THIS
    ];

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

    /**
     * Check if membership has any assigned residents
     */
    public function hasResidentsAssigned(): bool
    {
        return $this->users()->count() > 0;
    }

    // ✅ ADD THIS METHOD - Archive (soft delete)
    public function archive(?string $reason = null, ?string $deletedBy = null): void
    {
        if ($this->hasResidentsAssigned()) {
            throw new \Exception('Archive failed: Membership is currently in use');
        }
        
        $this->update([
            'is_active' => false,
            'deactivated_at' => now(),
            'deactivated_reason' => $reason,
            'deleted_by' => $deletedBy ?? auth()->user()?->user_code ?? 'SYSTEM',
        ]);
        $this->delete();
    }
    
    // ✅ ADD THIS METHOD - Restore
    public function unarchive(): void
    {
        $this->update([
            'is_active' => true,
            'deactivated_at' => null,
            'deactivated_reason' => null,
        ]);
        $this->restore();
    }
}
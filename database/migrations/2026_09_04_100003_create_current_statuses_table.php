<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Splits "Current Status" (Solo Parent and similar social/economic
     * tags) out of the civil_statuses table it used to share -- civil
     * status (Single/Married/Widowed/Separated) is a mutually-exclusive
     * marital fact, but "Solo Parent" isn't a marital status at all, and
     * forcing residents to pick only one meant a widowed solo parent
     * could never be recorded as both. See the
     * 2026_09_04_100006_migrate_solo_parent_to_current_status migration
     * for moving the existing data over.
     */
    public function up(): void
    {
        Schema::create('current_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('label', 50);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->string('deleted_by')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('current_statuses');
    }
};

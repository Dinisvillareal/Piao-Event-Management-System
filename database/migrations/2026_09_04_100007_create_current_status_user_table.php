<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Current Status turned out not to be mutually exclusive the way
     * civil status is -- a resident can plausibly be a Solo Parent AND a
     * PWD AND Indigent at the same time. A single current_status_id
     * column on users can only ever hold one, so this replaces it with a
     * standard many-to-many pivot. See
     * 2026_09_04_100008_migrate_current_status_id_to_pivot_table for the
     * data move + column drop.
     */
    public function up(): void
    {
        Schema::create('current_status_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('current_status_id')->constrained('current_statuses')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'current_status_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('current_status_user');
    }
};

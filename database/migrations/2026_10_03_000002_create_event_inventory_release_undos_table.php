<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A permanent log of every "undo a release" action -- one row per Undo
     * click, separate from event_inventory_releases itself (which only
     * tracks how much of a release is still outstanding, and is shared
     * across repeated *partial* undos of the same release). This is what
     * the Returns page's "Recently Undone" record reads: who undid how
     * much, when, and the evidence photo attached to that specific undo --
     * so a release undone twice (two partial corrections) shows as two
     * separate entries here instead of overwriting one shared field.
     */
    public function up(): void
    {
        Schema::create('event_inventory_release_undos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_inventory_release_id')->constrained('event_inventory_releases')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->string('undone_by')->nullable();
            $table->string('photo_path')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_inventory_release_undos');
    }
};

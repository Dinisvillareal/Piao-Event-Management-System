<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Evidence photos for the Returns page's release/undo actions -- same
     * pattern as inventory_items.photo_path: a nullable string path on the
     * `public` disk, exposed to the frontend as a full URL via accessors on
     * EventInventoryRelease.
     *
     * evidence_photo_path: proof photo taken when the item was physically
     * handed back and released from an event (EventController::releaseBorrowedItem).
     *
     * undo_photo_path: proof/reason photo taken when that release is
     * reversed (EventController::undoRelease). A partial undo re-saves the
     * same release row rather than creating a new one, so only the most
     * recent undo's photo is kept here -- acceptable since undoing is a
     * rare correction, not something that needs its own full history.
     */
    public function up(): void
    {
        Schema::table('event_inventory_releases', function (Blueprint $table) {
            $table->string('evidence_photo_path')->nullable()->after('released_by');
            $table->string('undo_photo_path')->nullable()->after('evidence_photo_path');
        });
    }

    public function down(): void
    {
        Schema::table('event_inventory_releases', function (Blueprint $table) {
            $table->dropColumn(['evidence_photo_path', 'undo_photo_path']);
        });
    }
};

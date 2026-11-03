<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per lost / found / disposed / restored report on an inventory
     * item: how many units (and which conditions), who recorded it, an optional
     * reason and photo, and -- for units lost while out on a loan -- the event
     * they were lost from (shown in Pending Returns).
     */
    public function up(): void
    {
        Schema::create('inventory_unit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('inventory_item_id')->index();
            $table->unsignedBigInteger('event_id')->nullable()->index();
            $table->string('action', 16); // lost | found | disposed | restored
            $table->unsignedInteger('quantity');
            $table->json('units')->nullable();
            $table->string('reason', 255)->nullable();
            $table->string('photo_path')->nullable();
            $table->string('user_code')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_unit_logs');
    }
};

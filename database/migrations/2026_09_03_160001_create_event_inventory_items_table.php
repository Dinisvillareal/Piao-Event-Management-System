<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Items borrowed from Inventory for a specific Event. Quantity is
    // deducted from inventory_items.quantity when a row here is created,
    // and restored when the event is updated/archived (see EventController).
    public function up(): void
    {
        Schema::create('event_inventory_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_inventory_items');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // A permanent log of every "release borrowed item back to Inventory"
    // action -- event_inventory_items only keeps a running remaining
    // balance, so once a release happens there's no record of it to
    // correct a mis-entered quantity against. This table is what an
    // "Undo" action reads: which event, which item, how much, and
    // whether it's already been undone.
    public function up(): void
    {
        Schema::create('event_inventory_releases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->string('released_by')->nullable();
            $table->timestamp('undone_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_inventory_releases');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // UC-9: Manage Barangay Inventory
    public function up(): void
    {
        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->unsignedInteger('quantity')->default(0);
            $table->enum('condition', ['New', 'Good', 'Fair', 'Poor', 'Disposed', 'Lost'])->default('Good');
            $table->string('storage_location', 150)->nullable();
            $table->string('notes', 255)->nullable();
            $table->string('deleted_by', 50)->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_items');
    }
};

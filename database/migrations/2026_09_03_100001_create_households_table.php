<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Real Household module (replaces the old free-text `household_code`
     * string-matching approach on `users`). A household is now a first-class
     * record: staff pick an existing household from a list/search instead of
     * retyping a code, which is what actually keeps a family grouped
     * together correctly for household-head SMS notifications.
     */
    public function up(): void
    {
        Schema::create('households', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique(); // auto-generated, e.g. HH-0001
            $table->string('address', 255)->nullable();
            $table->string('contact_number', 15)->nullable(); // shared household SMS number
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('households');
    }
};

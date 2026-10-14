<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('name_suffixes', function (Blueprint $table) {
            $table->id();
            $table->string('name', 10)->unique();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // Start with the usual suffixes so the dropdown is never empty.
        $now = now();
        foreach (['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as $i => $name) {
            DB::table('name_suffixes')->insert([
                'name' => $name,
                'sort_order' => $i + 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('name_suffixes');
    }
};

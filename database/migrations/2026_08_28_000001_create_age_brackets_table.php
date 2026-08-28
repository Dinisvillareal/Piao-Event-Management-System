<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('age_brackets', function (Blueprint $table) {
            $table->id();
            $table->string('label', 50);
            $table->unsignedSmallInteger('min_age')->default(0);
            $table->unsignedSmallInteger('max_age')->nullable(); // null = no upper limit
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // Adviser recommendation: "Profiling (Filter for Age)" — now Staff-configurable
        // via Settings instead of hardcoded, per capstone adviser feedback.
        DB::table('age_brackets')->insert([
            ['label' => 'Child',          'min_age' => 0,  'max_age' => 12,   'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Youth',          'min_age' => 13, 'max_age' => 17,   'sort_order' => 2, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Adult',          'min_age' => 18, 'max_age' => 59,   'sort_order' => 3, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Senior Citizen', 'min_age' => 60, 'max_age' => null, 'sort_order' => 4, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('age_brackets');
    }
};

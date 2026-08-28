<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('civil_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('label', 50);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // Adviser example: Senior Citizen eligibility — extended here to also
        // cover Solo Parent ("single mom") so both can be validated the same way.
        DB::table('civil_statuses')->insert([
            ['label' => 'Single',      'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Married',     'sort_order' => 2, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Widowed',     'sort_order' => 3, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Separated',   'sort_order' => 4, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Solo Parent', 'sort_order' => 5, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('civil_statuses');
    }
};

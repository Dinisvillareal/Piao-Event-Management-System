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

        // Solo Parent used to be seeded here too (as a stand-in for "current
        // status" eligibility, alongside real civil statuses) -- it now
        // lives in current_statuses instead (see
        // 2026_09_04_100003_create_current_statuses_table), since it isn't
        // a marital status and forcing residents to pick only one of the
        // two meant a widowed solo parent could never be recorded as both.
        DB::table('civil_statuses')->insert([
            ['label' => 'Single',      'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Married',     'sort_order' => 2, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Widowed',     'sort_order' => 3, 'created_at' => now(), 'updated_at' => now()],
            ['label' => 'Separated',   'sort_order' => 4, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('civil_statuses');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // One row per report a staff member printed or downloaded, so the Reports
    // page can show a "Report History" and let staff re-run the same report.
    public function up(): void
    {
        Schema::create('generated_reports', function (Blueprint $table) {
            $table->id();
            $table->string('user_code', 40)->nullable();
            $table->string('type', 20);              // attendance | membership | budget | inventory
            $table->string('format', 10);            // print | pdf | word | csv
            $table->string('title');
            $table->string('scope_label')->nullable(); // "Period: 2026-10-01 – 2026-10-31", "Event: Clean-up Drive"...
            $table->json('filters')->nullable();
            $table->json('sections')->nullable();
            $table->timestamps();
            $table->index(['type', 'created_at']);
            $table->index('user_code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generated_reports');
    }
};

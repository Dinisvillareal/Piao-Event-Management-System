<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            // null = open to everyone regardless of gender (no restriction)
            $table->enum('eligible_gender', ['Male', 'Female'])->nullable()->after('eligible_civil_status_id');
        });
    }

    public function down(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->dropColumn('eligible_gender');
        });
    }
};

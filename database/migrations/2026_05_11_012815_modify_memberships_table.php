<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            // Add description column after the name column
            $table->text('description')->nullable()->after('name');
            
            // Drop the default Laravel timestamps
            $table->dropColumn(['created_at', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            // Remove description column
            $table->dropColumn('description');
            
            // Add back the timestamps
            $table->timestamps();
        });
    }
};
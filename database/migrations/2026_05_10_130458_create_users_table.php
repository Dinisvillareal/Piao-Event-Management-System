<?php

// ========================================
// MIGRATION
// database/migrations/xxxx_xx_xx_create_users_table.php
// ========================================

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {

            $table->id();

            // PR-000001
            $table->string('user_code', 20)->unique();

            $table->string('first_name', 70);
            $table->string('last_name', 70);
            $table->string('middle_name', 70)->nullable();

            $table->string('contact_number', 15);

            $table->enum('role', ['Staff', 'Resident'])
                ->default('Resident');

            $table->string('password', 255);

            // 0 = temp password
            // 1 = changed password
            $table->boolean('has_account')
                ->default(0);

            // 🔥 SOFT DELETE
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};

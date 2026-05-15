<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {

            $table->id(); // primary key (auto increment)

            // 🔥 PR CODE HERE
            $table->string('user_code')->unique();

            $table->string('first_name');
            $table->string('last_name');
            $table->string('middle_name')->nullable();

            $table->string('contact_number');
            $table->enum('role', ['Staff', 'Resident'])->default('Resident');

            // 🔥 for login (since no account table confusion anymore)
            $table->string('password');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {

            $table->id();

            $table->string('user_code', 50)->unique();

            $table->string('first_name', 70);
            $table->string('last_name', 70);
            $table->string('middle_name', 70)->nullable();

            $table->string('contact_number', 15);

            $table->string('validation_id')->nullable();

            $table->enum('role', ['Staff', 'Resident'])
                ->default('Resident');

            $table->string('password', 255)->nullable();

            $table->boolean('has_account')->default(0);

            // ✅ ADD THIS
            $table->string('deleted_by', 50)->nullable();

            $table->softDeletes();
        });
    }
        public function down(): void
    {
        Schema::dropIfExists('users');
    }
};

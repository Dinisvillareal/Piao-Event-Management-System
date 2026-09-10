<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Adviser recommendation: "Profiling (Filter for Age)"
            $table->date('birth_date')->nullable()->after('contact_number');
            $table->string('address', 150)->nullable()->after('birth_date');

            // Adviser recommendation: "Notify by household — head of household — SMS contact number per household"
            $table->string('household_code', 30)->nullable()->after('address');
            $table->boolean('is_household_head')->default(false)->after('household_code');
            $table->string('household_contact_number', 15)->nullable()->after('is_household_head');

            // UC-17: Switch Interface Language (persisted preference for logged-in users)
            $table->string('preferred_language', 10)->default('en')->after('household_contact_number');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'birth_date',
                'address',
                'household_code',
                'is_household_head',
                'household_contact_number',
                'preferred_language',
            ]);
        });
    }
};

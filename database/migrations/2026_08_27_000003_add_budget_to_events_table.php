<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // UC-8: Record Event Budget and Expenses
    public function up(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->decimal('approved_budget', 10, 2)->nullable()->after('notification_message');
        });
    }

    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dropColumn('approved_budget');
        });
    }
};

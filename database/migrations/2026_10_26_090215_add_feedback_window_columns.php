<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->unsignedSmallInteger('close_after_hours')
                ->default(12)
                ->after('comment');

            $table->unsignedSmallInteger('edit_window_minutes')
                ->default(20)
                ->after('close_after_hours');

            $table->softDeletes();
            $table->string('deleted_by', 50)->nullable()->after('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->dropSoftDeletes();
            $table->dropColumn(['close_after_hours', 'edit_window_minutes', 'deleted_by']);
        });
    }
};
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // The member can heart the staff reply, like a comment thread.
    public function up(): void
    {
        foreach (['feedback', 'absence_reasons'] as $tbl) {
            Schema::table($tbl, function (Blueprint $table) {
                $table->timestamp('member_liked_reply_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['feedback', 'absence_reasons'] as $tbl) {
            Schema::table($tbl, function (Blueprint $table) {
                $table->dropColumn('member_liked_reply_at');
            });
        }
    }
};

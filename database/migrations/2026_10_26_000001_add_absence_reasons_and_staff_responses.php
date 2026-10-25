<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // UC-16 (alternate flow): members who could not attend say why, and staff
    // can acknowledge (heart) and reply to both ratings and those reasons.
    public function up(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->timestamp('staff_liked_at')->nullable();
            $table->text('staff_reply')->nullable();
            $table->timestamp('staff_replied_at')->nullable();
            $table->foreignId('staff_replied_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('absence_reasons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('reason', 40);
            $table->text('comment')->nullable();
            $table->timestamp('staff_liked_at')->nullable();
            $table->text('staff_reply')->nullable();
            $table->timestamp('staff_replied_at')->nullable();
            $table->foreignId('staff_replied_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['event_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('absence_reasons');
        Schema::table('feedback', function (Blueprint $table) {
            $table->dropConstrainedForeignId('staff_replied_by');
            $table->dropColumn(['staff_liked_at', 'staff_reply', 'staff_replied_at']);
        });
    }
};

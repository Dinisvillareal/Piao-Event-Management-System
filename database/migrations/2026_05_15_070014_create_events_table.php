<?php
 
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
 
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->string('name', 255);
            $table->text('description');
            $table->string('location', 100);
            $table->dateTime('event_start');
            $table->dateTime('event_end');
            $table->json('membership_ids')->nullable();
            $table->text('notification_message')->nullable();
        });
    }
 
    public function down(): void
    {
        Schema::dropIfExists('events');
    }
};
 
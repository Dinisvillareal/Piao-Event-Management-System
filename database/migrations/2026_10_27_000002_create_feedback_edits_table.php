<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // One row per PREVIOUS version of a rating or a "couldn't attend" reason,
    // saved when the member edits it -- the "Edited" history.
    public function up(): void
    {
        Schema::create('feedback_edits', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 10);              // rating | absence
            $table->unsignedBigInteger('item_id');   // feedback.id or absence_reasons.id
            $table->unsignedTinyInteger('rating')->nullable();
            $table->string('reason', 40)->nullable();
            $table->text('comment')->nullable();
            $table->timestamp('written_at')->nullable(); // when that version was sent
            $table->timestamps();
            $table->index(['kind', 'item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feedback_edits');
    }
};

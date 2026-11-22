<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Deleting a household unlinks its members. This column remembers who they
     * were (and who the head was) so restoring the household from the Archive can
     * link them back instead of leaving an empty household.
     */
    public function up(): void
    {
        Schema::table('households', function (Blueprint $table) {
            $table->json('dissolved_members')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('households', function (Blueprint $table) {
            $table->dropColumn('dissolved_members');
        });
    }
};

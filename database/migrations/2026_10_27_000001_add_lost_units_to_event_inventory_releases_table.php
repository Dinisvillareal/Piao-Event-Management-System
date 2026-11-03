<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Units that never came back can be reported right in the Return dialog,
     * so the release remembers them: how many were lost, which conditions
     * they were borrowed in, and how many of them were already counted as
     * "lost pending" on the item (so Undo can put everything back exactly).
     */
    public function up(): void
    {
        Schema::table('event_inventory_releases', function (Blueprint $table) {
            $table->unsignedInteger('lost_quantity')->default(0)->after('quantity');
            $table->unsignedInteger('lost_from_pending')->default(0)->after('lost_quantity');
            $table->json('lost_units')->nullable()->after('lost_from_pending');
        });
    }

    public function down(): void
    {
        Schema::table('event_inventory_releases', function (Blueprint $table) {
            $table->dropColumn(['lost_quantity', 'lost_from_pending', 'lost_units']);
        });
    }
};

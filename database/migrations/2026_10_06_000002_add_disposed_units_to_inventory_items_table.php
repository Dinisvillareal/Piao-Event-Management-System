<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Disposed units are tracked per item (like lost_quantity), so disposing
     * of a few worn-out units never archives or relabels the good ones.
     */
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->unsignedInteger('disposed_quantity')->default(0)->after('lost_pending');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn('disposed_quantity');
        });
    }
};

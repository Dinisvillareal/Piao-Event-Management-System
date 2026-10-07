<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lost units are tracked per item instead of tagging the whole row as
     * Lost, so a few lost units never drag the still-good ones down with them.
     *
     * lost_quantity: total units reported lost.
     * lost_pending:  the part of those that were still out on loan when
     *                reported (not yet deducted from stock).
     */
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->unsignedInteger('lost_quantity')->default(0)->after('quantity');
            $table->unsignedInteger('lost_pending')->default(0)->after('lost_quantity');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn(['lost_quantity', 'lost_pending']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An item's condition describes the units that are still in use, so it is
     * now New / Good / Fair / Poor only. Lost and disposed gear is tracked by
     * unit counts (lost_quantity, lost_pending, disposed_quantity) and never
     * by tagging a whole row.
     *
     * Rows that were still tagged Lost / Disposed are converted first: all of
     * their remaining stock moves into the matching unit counter, and the row
     * keeps a plain "Poor" condition.
     */
    public function up(): void
    {
        DB::table('inventory_items')->where('condition', 'Lost')->update([
            'lost_quantity' => DB::raw('lost_quantity + quantity'),
            'quantity' => 0,
            'condition' => 'Poor',
        ]);

        DB::table('inventory_items')->where('condition', 'Disposed')->update([
            'disposed_quantity' => DB::raw('disposed_quantity + quantity'),
            'quantity' => 0,
            'condition' => 'Poor',
        ]);

        Schema::table('inventory_items', function (Blueprint $table) {
            $table->enum('condition', ['New', 'Good', 'Fair', 'Poor'])->default('Good')->change();
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->enum('condition', ['New', 'Good', 'Fair', 'Poor', 'Disposed', 'Lost'])->default('Good')->change();
        });
    }
};

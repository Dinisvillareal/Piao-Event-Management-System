<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->string('deleted_by')->nullable()->after('deactivated_reason');
        });
    }

    public function down()
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->dropColumn('deleted_by');
        });
    }
};
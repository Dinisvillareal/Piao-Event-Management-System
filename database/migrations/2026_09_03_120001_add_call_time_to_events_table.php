<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Call time" attendance window: staff invite residents earlier than
     * the event's actual start (e.g. call time 6:00, event starts 7:00) so
     * there's a real sign-in window instead of "any time before the event
     * ends." Sign-in is only allowed between call_time_start and
     * event_start; sign-out only between event_end and call_time_end.
     * Both are nullable -- events created before this feature (or without
     * a call time set) fall back to the old, more permissive behavior.
     */
    public function up(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dateTime('call_time_start')->nullable()->after('event_start');
            $table->dateTime('call_time_end')->nullable()->after('event_end');
        });
    }

    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dropColumn(['call_time_start', 'call_time_end']);
        });
    }
};

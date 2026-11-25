<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Account activation. Staff never type or see a resident's password: when a portal account is given
 * (or reset), the system makes a one-time activation code that is printed once on a slip. The resident
 * uses it, with their user code and birth date, to choose their own password.
 *
 *   activation_code_hash        the code, stored only as a hash (set = the account is waiting to be activated)
 *   activation_expires_at       the code stops working after this time (48 hours)
 *   activation_failed_attempts  wrong tries; five wrong tries cancel the code
 *   activation_issued_by        the user code of the staff member who printed the slip
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('activation_code_hash', 255)->nullable();
            $table->timestamp('activation_expires_at')->nullable();
            $table->unsignedTinyInteger('activation_failed_attempts')->default(0);
            $table->string('activation_issued_by', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['activation_code_hash', 'activation_expires_at', 'activation_failed_attempts', 'activation_issued_by']);
        });
    }
};

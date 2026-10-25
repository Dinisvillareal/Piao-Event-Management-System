<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Account security: Head Staff, lockout, suspension, forced password change,
 * last-login tracking, optional two-step login, recovery codes, Head Staff
 * transfers and the security-alert feed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_head_staff')->default(false);
            $table->boolean('must_change_password')->default(false);
            $table->timestamp('suspended_at')->nullable();
            $table->unsignedSmallInteger('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->string('last_login_ip', 45)->nullable();
            $table->timestamp('password_changed_at')->nullable();
            $table->text('two_factor_secret')->nullable();
            $table->timestamp('two_factor_confirmed_at')->nullable();
        });

        // At most ONE active Head Staff, enforced by the database itself
        // (same trick as the one-holder-per-post rule on barangay_position).
        DB::statement(
            "ALTER TABLE users ADD COLUMN head_staff_key TINYINT
             GENERATED ALWAYS AS (CASE WHEN is_head_staff = 1 AND deleted_at IS NULL THEN 1 ELSE NULL END) STORED"
        );
        Schema::table('users', function (Blueprint $table) {
            $table->unique('head_staff_key', 'users_one_active_head_staff');
        });

        Schema::create('staff_recovery_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('code_hash');
            $table->timestamp('used_at')->nullable();
            $table->timestamps();
        });

        Schema::create('head_staff_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('from_user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('to_user_id')->constrained('users')->onDelete('cascade');
            $table->string('status', 20)->default('pending'); // pending | accepted | cancelled | expired
            $table->timestamp('expires_at');
            $table->timestamps();
        });

        Schema::create('security_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade'); // recipient
            $table->string('type', 40);
            $table->string('title');
            $table->text('message');
            $table->boolean('read')->default(false);
            $table->timestamps();
            $table->index(['user_id', 'read']);
        });

        // The Barangay Secretary (a Staff account) becomes the first Head
        // Staff. If there is none, run `php artisan staff:set-head PR-XXXX`.
        $secretaryId = DB::table('users')
            ->where('role', 'Staff')
            ->where('barangay_position', 'secretary')
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->value('id');
        if ($secretaryId) {
            DB::table('users')->where('id', $secretaryId)->update(['is_head_staff' => 1]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('security_alerts');
        Schema::dropIfExists('head_staff_transfers');
        Schema::dropIfExists('staff_recovery_codes');

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_one_active_head_staff');
        });
        DB::statement('ALTER TABLE users DROP COLUMN head_staff_key');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'is_head_staff', 'must_change_password', 'suspended_at', 'failed_login_attempts',
                'locked_until', 'last_login_at', 'last_login_ip', 'password_changed_at',
                'two_factor_secret', 'two_factor_confirmed_at',
            ]);
        });
    }
};

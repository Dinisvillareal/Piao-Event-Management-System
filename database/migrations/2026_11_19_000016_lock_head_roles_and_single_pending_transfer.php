<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Four rules about who holds a role, enforced by the database itself so that no route, script,
 * import or hand edit can break them:
 *
 *   Head Staff is Staff      users.is_head_staff may only be on for a Staff account.
 *   Head has a household     users.is_household_head may only be on for a resident who has a household
 *                            (a real one, or the older household_code the SMS grouping still reads).
 *   Head cannot just move    A household head who is moved to another household must stop being head
 *                            in the same change (the app already clears the flag when the household
 *                            changes; this stops a script or hand edit that forgets to).
 *   One pending transfer     Only one Head Staff transfer can be 'pending' at a time. Two requests
 *                            that collide can no longer both create an offer: the second is refused
 *                            by a unique index (the one thing a trigger cannot guarantee under
 *                            concurrency), and the app turns that into a plain message.
 *
 * The first three are triggers, not CHECK constraints: users.household_id has an "on delete set
 * null" link, and MySQL refuses a CHECK on a column used in such a link. Triggers also judge a
 * user only when one of the columns involved changes, so a record saved earlier never blocks an
 * unrelated edit. The unique index cannot be created while two pending transfers exist, so the
 * migration checks first and, if it finds any, stops, changes NOTHING and lists them.
 *
 * The unique index is a partial index on SQLite (the tests) and a unique index on a generated
 * column on MySQL and MariaDB (the same technique as users_one_active_head_staff).
 */
return new class extends Migration
{
    private const INDEX = 'head_staff_transfers_one_pending';

    private const TRIGGERS = [
        'users_head_staff_role_chk_insert',
        'users_head_staff_role_chk_update',
        'users_household_head_chk_insert',
        'users_household_head_chk_update',
        'users_household_head_move_chk_update',
    ];

    public function up(): void
    {
        $this->assertAtMostOnePendingTransfer();
        $this->down();   // safe to run twice
        $sqlite = DB::getDriverName() === 'sqlite';

        $changed = fn (string $c) => $sqlite ? "NEW.{$c} IS NOT OLD.{$c}" : "NOT (NEW.{$c} <=> OLD.{$c})";

        $headNotStaff = "NEW.is_head_staff = 1 AND NEW.role <> 'Staff'";
        // a household is a real one (household_id) or the older free-text household_code that SMS grouping still reads
        $headNoHousehold = "NEW.is_household_head = 1 AND NEW.household_id IS NULL AND (NEW.household_code IS NULL OR NEW.household_code = '')";
        $headMoved = "OLD.is_household_head = 1 AND NEW.is_household_head = 1 AND OLD.household_id IS NOT NULL AND NEW.household_id IS NOT NULL AND {$changed('household_id')}";

        $this->trigger('users_head_staff_role_chk_insert', 'INSERT', null, $headNotStaff,
            'Only a Staff account can be the Head Staff.', $sqlite);
        $this->trigger('users_head_staff_role_chk_update', 'UPDATE', 'is_head_staff, role',
            "({$changed('is_head_staff')} OR {$changed('role')}) AND ({$headNotStaff})",
            'Only a Staff account can be the Head Staff.', $sqlite);

        $this->trigger('users_household_head_chk_insert', 'INSERT', null, $headNoHousehold,
            'A household head must belong to a household.', $sqlite);
        $this->trigger('users_household_head_chk_update', 'UPDATE', 'is_household_head, household_id, household_code',
            "({$changed('is_household_head')} OR {$changed('household_id')} OR {$changed('household_code')}) AND ({$headNoHousehold})",
            'A household head must belong to a household.', $sqlite);

        $this->trigger('users_household_head_move_chk_update', 'UPDATE', 'household_id', $headMoved,
            'A household head who moves to another household must stop being head in the same change.', $sqlite);

        if ($sqlite) {
            DB::unprepared("CREATE UNIQUE INDEX " . self::INDEX . " ON head_staff_transfers (status) WHERE status = 'pending'");
        } else {
            DB::statement("ALTER TABLE head_staff_transfers ADD COLUMN pending_key TINYINT GENERATED ALWAYS AS (CASE WHEN status = 'pending' THEN 1 ELSE NULL END) STORED");
            DB::statement('ALTER TABLE head_staff_transfers ADD UNIQUE ' . self::INDEX . ' (pending_key)');
        }
    }

    public function down(): void
    {
        foreach (self::TRIGGERS as $name) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}");
        }

        if (DB::getDriverName() === 'sqlite') {
            DB::unprepared('DROP INDEX IF EXISTS ' . self::INDEX);
            return;
        }

        try {
            DB::statement('ALTER TABLE head_staff_transfers DROP INDEX ' . self::INDEX);
        } catch (Throwable $e) {
            // already gone
        }
        try {
            DB::statement('ALTER TABLE head_staff_transfers DROP COLUMN pending_key');
        } catch (Throwable $e) {
            // already gone
        }
    }

    /** The unique index cannot exist while two offers are pending, so look first and change nothing if they are. */
    private function assertAtMostOnePendingTransfer(): void
    {
        $pending = DB::table('head_staff_transfers')->where('status', 'pending')->orderBy('id')->pluck('id');

        if ($pending->count() > 1) {
            throw new RuntimeException(
                "Cannot lock one pending Head Staff transfer: {$pending->count()} are pending (#" . $pending->implode(', #')
                . "). Cancel all but one (set status to 'cancelled') and run the migration again; nothing was changed."
            );
        }
    }

    /** $bad = the condition under which the change must be refused. */
    private function trigger(string $name, string $event, ?string $updateOf, string $bad, string $message, bool $sqlite): void
    {
        if ($sqlite) {
            $on = $event === 'UPDATE' && $updateOf ? "UPDATE OF {$updateOf}" : $event;
            DB::unprepared("CREATE TRIGGER {$name} BEFORE {$on} ON users FOR EACH ROW WHEN {$bad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON users FOR EACH ROW BEGIN IF {$bad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
    }
};

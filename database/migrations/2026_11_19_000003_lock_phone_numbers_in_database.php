<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Locks phone numbers at the database, so that a malformed number cannot be saved
 * by any route -- a forgotten validation rule, a script, an import or a manual
 * edit in phpMyAdmin -- not only by the forms.
 *
 *   users.contact_number            required, exactly 09XXXXXXXXX
 *   users.household_contact_number  empty, or 09XXXXXXXXX / 639XXXXXXXXX
 *   households.contact_number       empty, or 09XXXXXXXXX / 639XXXXXXXXX
 *
 * Numbers already stored are first cleaned up (dashes, spaces and +63 removed;
 * a blank household number becomes empty). If a number is still not a valid
 * mobile number the migration stops BEFORE changing anything and lists the rows,
 * so no data is ever lost or guessed.
 *
 * MySQL 8.0.16+ and MariaDB 10.2.1+ get a CHECK constraint; older MySQL, which
 * silently ignores CHECK, and SQLite (used by the tests) get triggers instead.
 */
return new class extends Migration
{
    /** table => [column => [nullable, patternKey]] */
    private const RULES = [
        'users'      => ['contact_number' => [false, 'local'], 'household_contact_number' => [true, 'any']],
        'households' => ['contact_number' => [true, 'any']],
    ];

    private const MESSAGE = 'Invalid mobile number: use 09XXXXXXXXX.';

    public function up(): void
    {
        $this->cleanExistingNumbers();

        foreach (self::RULES as $table => $columns) {
            foreach ($columns as $column => [$nullable, $kind]) {
                $this->lock($table, $column, $nullable, $kind);
            }
        }
    }

    public function down(): void
    {
        foreach (self::RULES as $table => $columns) {
            foreach (array_keys($columns) as $column) {
                $this->unlock($table, $column);
            }
        }
    }

    // ------------------------------------------------------------------ clean-up

    private function cleanExistingNumbers(): void
    {
        $unfixable = [];
        $updates = [];

        foreach (self::RULES as $table => $columns) {
            foreach ($columns as $column => [$nullable, $kind]) {
                DB::table($table)->select(['id', $column])->orderBy('id')->each(function ($row) use ($table, $column, $nullable, $kind, &$unfixable, &$updates) {
                    $raw = $row->{$column};
                    if ($raw === null) {
                        if (!$nullable) {
                            $unfixable[] = "{$table}.{$column} #{$row->id}: empty";
                        }
                        return;
                    }

                    $fixed = $this->fix((string) $raw, $kind);
                    if ($fixed === '') {
                        $fixed = $nullable ? null : false;   // blank is fine for an optional number only
                    }

                    if ($fixed === false) {
                        $unfixable[] = "{$table}.{$column} #{$row->id}: '{$raw}'";
                    } elseif ($fixed !== $raw) {
                        $updates[] = [$table, $column, $row->id, $fixed];
                    }
                });
            }
        }

        if ($unfixable) {
            $shown = array_slice($unfixable, 0, 25);
            throw new RuntimeException(
                "Cannot lock phone numbers: " . count($unfixable) . " stored number(s) are not valid Philippine mobile numbers. "
                . "Correct them (09XXXXXXXXX) and run the migration again; nothing was changed.\n  "
                . implode("\n  ", $shown)
                . (count($unfixable) > count($shown) ? "\n  ... and " . (count($unfixable) - count($shown)) . ' more' : '')
            );
        }

        foreach ($updates as [$table, $column, $id, $value]) {
            DB::table($table)->where('id', $id)->update([$column => $value]);
        }
    }

    /** The cleaned number, '' for blank, or false when it cannot be repaired. */
    private function fix(string $raw, string $kind): string|false
    {
        $digits = preg_replace('/\D/', '', $raw);
        if ($digits === '') {
            return '';
        }
        if ($kind === 'local') {
            if (preg_match('/^639\d{9}$/', $digits)) {
                $digits = '0' . substr($digits, 2);
            }
            return preg_match('/^09\d{9}$/', $digits) ? $digits : false;
        }
        return preg_match('/^(09|639)\d{9}$/', $digits) ? $digits : false;
    }

    // --------------------------------------------------------------- constraints

    private function lock(string $table, string $column, bool $nullable, string $kind): void
    {
        $name = "{$table}_{$column}_format";

        if (DB::getDriverName() === 'sqlite') {
            $glob = $kind === 'local'
                ? [$this->glob('09', 9)]
                : [$this->glob('09', 9), $this->glob('639', 9)];
            $bad = implode(' AND ', array_map(fn ($g) => "NEW.{$column} NOT GLOB '{$g}'", $glob));
            $when = $nullable ? "NEW.{$column} IS NOT NULL AND {$bad}" : "NEW.{$column} IS NULL OR ({$bad})";
            foreach (['insert' => 'BEFORE INSERT', 'update' => "BEFORE UPDATE OF {$column}"] as $suffix => $event) {
                DB::unprepared("CREATE TRIGGER {$name}_{$suffix} {$event} ON {$table} FOR EACH ROW WHEN {$when} BEGIN SELECT RAISE(ABORT, '" . self::MESSAGE . "'); END");
            }
            return;
        }

        $regex = $kind === 'local' ? '^09[0-9]{9}$' : '^(09|639)[0-9]{9}$';
        $expr  = $nullable ? "{$column} IS NULL OR {$column} REGEXP '{$regex}'" : "{$column} REGEXP '{$regex}'";

        if ($this->supportsCheck()) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expr})");
            return;
        }

        // Old MySQL parses CHECK but ignores it, so enforce the rule with triggers.
        $cond = $nullable ? "NEW.{$column} IS NOT NULL AND NEW.{$column} NOT REGEXP '{$regex}'" : "NEW.{$column} IS NULL OR NEW.{$column} NOT REGEXP '{$regex}'";
        foreach (['insert' => 'BEFORE INSERT', 'update' => 'BEFORE UPDATE'] as $suffix => $event) {
            DB::unprepared("CREATE TRIGGER {$name}_{$suffix} {$event} ON {$table} FOR EACH ROW BEGIN IF {$cond} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '" . self::MESSAGE . "'; END IF; END");
        }
    }

    private function unlock(string $table, string $column): void
    {
        $name = "{$table}_{$column}_format";

        if (DB::getDriverName() === 'sqlite') {
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}_insert");
            DB::unprepared("DROP TRIGGER IF EXISTS {$name}_update");
            return;
        }

        if ($this->supportsCheck()) {
            $how = $this->isMariaDb() || version_compare($this->version(), '8.0.19', '>=') ? 'CONSTRAINT' : 'CHECK';
            DB::statement("ALTER TABLE {$table} DROP {$how} {$name}");
            return;
        }

        DB::unprepared("DROP TRIGGER IF EXISTS {$name}_insert");
        DB::unprepared("DROP TRIGGER IF EXISTS {$name}_update");
    }

    private function glob(string $prefix, int $digits): string
    {
        return $prefix . str_repeat('[0-9]', $digits);
    }

    private function version(): string
    {
        return (string) DB::scalar('SELECT VERSION()');
    }

    private function isMariaDb(): bool
    {
        return stripos($this->version(), 'mariadb') !== false;
    }

    private function supportsCheck(): bool
    {
        $v = preg_replace('/^5\.5\.5-/', '', $this->version());   // MariaDB's replication-compatible prefix
        preg_match('/\d+\.\d+\.\d+/', $v, $m);
        $num = $m[0] ?? '0.0.0';
        return $this->isMariaDb() ? version_compare($num, '10.2.1', '>=') : version_compare($num, '8.0.16', '>=');
    }
};

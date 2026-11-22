<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Makes every code look exactly the same, enforced by the database itself:
 *
 *   users.user_code    PR-0001   ("PR-" + at least 4 digits, nothing else)
 *   households.code   HH-0001   ("HH-" + at least 4 digits, nothing else)
 *
 * The first lock (2026_11_19_000006) only checked the characters, so an edit
 * such as PR-0001gggg was still accepted. This one checks the whole shape.
 *
 * Codes already stored are repaired only when the fix is obvious and safe:
 * the right prefix and number followed by stray text (PR-0001gggg) or a
 * number with fewer than 4 digits (PR-7) become PR-0001 / PR-0007. The new
 * code is also written into the places that copy it (activity log, stock log,
 * generated reports, residents' household code) so nothing is orphaned. If a
 * code cannot be repaired safely, or the repaired code is already taken, the
 * migration stops BEFORE changing anything and lists the rows.
 *
 * MySQL 8.0.16+ and MariaDB 10.2.1+ get CHECK constraints; older MySQL (which
 * ignores CHECK) and SQLite (used by the tests) get triggers.
 */
return new class extends Migration
{
    /** table => [column, prefix, message] */
    private const CODES = [
        'users'      => ['user_code', 'PR', 'User code must look like PR-0001.'],
        'households' => ['code', 'HH', 'Household code must look like HH-0001.'],
    ];

    private const LOOSE_MESSAGES = [
        'users'      => 'User code may only contain letters, digits and dashes.',
        'households' => 'Household code may only contain letters, digits and dashes.',
    ];

    public function up(): void
    {
        $plan = $this->repairPlan();

        DB::transaction(function () use ($plan) {
            foreach ($plan as [$table, $column, $id, $old, $new]) {
                DB::table($table)->where('id', $id)->update([$column => $new]);
                $this->followCode($table, $old, $new);
            }
        });

        foreach (self::CODES as $table => [$column, $prefix, $message]) {
            $this->replace($table, $column, $this->strict($column, $prefix), $message);
        }
    }

    public function down(): void
    {
        foreach (self::CODES as $table => [$column]) {
            $this->replace($table, $column, $this->loose($column), self::LOOSE_MESSAGES[$table]);
        }
    }

    // ------------------------------------------------------------------ repair

    /** @return array<int, array{string,string,int,string,string}> table, column, id, old, new */
    private function repairPlan(): array
    {
        $plan = [];
        $problems = [];

        foreach (self::CODES as $table => [$column, $prefix]) {
            $rows = DB::table($table)->orderBy('id')->get(['id', $column]);
            $taken = [];
            foreach ($rows as $r) {
                $taken[(string) $r->{$column}] = true;
            }

            foreach ($rows as $r) {
                $old = (string) $r->{$column};
                if (preg_match('/^' . $prefix . '-[0-9]{4,}$/', $old)) {
                    continue;   // already uniform (case-sensitive)
                }

                // PREFIX-123, prefix-123, PREFIX-0001abc ... : right prefix and a number, then at most stray text.
                if (preg_match('/^' . $prefix . '-?([0-9]+)[A-Za-z0-9_\- ]*$/i', trim($old), $m)) {
                    $new = $prefix . '-' . str_pad(ltrim($m[1], '0') === '' ? '0' : ltrim($m[1], '0'), 4, '0', STR_PAD_LEFT);
                    if (! isset($taken[$new])) {
                        $taken[$new] = true;
                        $plan[] = [$table, $column, (int) $r->id, $old, $new];
                        continue;
                    }
                    $problems[] = "{$table}.{$column} #{$r->id}: '{$old}' would become {$new}, but that code is already used";
                    continue;
                }

                $problems[] = "{$table}.{$column} #{$r->id}: '{$old}'";
            }
        }

        if ($problems) {
            throw new RuntimeException(
                'Cannot make the codes uniform: ' . count($problems) . " stored code(s) cannot be repaired safely. Correct them (PR-0001 / HH-0001) and run the migration again; nothing was changed.\n  "
                . implode("\n  ", array_slice($problems, 0, 25))
            );
        }

        return $plan;
    }

    /** Copies of a code that live in other tables follow it, so no history is orphaned. */
    private function followCode(string $table, string $old, string $new): void
    {
        $copies = $table === 'users'
            ? [['activity_logs', 'user_code'], ['inventory_unit_logs', 'user_code'], ['generated_reports', 'user_code']]
            : [['users', 'household_code']];

        foreach ($copies as [$t, $c]) {
            if (Schema::hasTable($t) && Schema::hasColumn($t, $c)) {
                DB::table($t)->where($c, $old)->update([$c => $new]);
            }
        }
    }

    // ------------------------------------------------------------------ conditions: [mysql, sqlite]

    private function strict(string $c, string $prefix): array
    {
        return [
            "{$c} REGEXP '^{$prefix}-[0-9]{4,}\$' AND CAST(LEFT({$c}, 3) AS BINARY) = CAST('{$prefix}-' AS BINARY)",   // BINARY keeps it upper-case
            "{$c} GLOB '{$prefix}-[0-9][0-9][0-9][0-9]*' AND substr({$c}, 4) NOT GLOB '*[^0-9]*'",
        ];
    }

    private function loose(string $c): array
    {
        return ["{$c} REGEXP '^[A-Za-z0-9-]+\$'", "{$c} NOT GLOB '*[^A-Za-z0-9-]*' AND {$c} <> ''"];
    }

    // ------------------------------------------------------------------ constraints

    /** Drops the current code rule and puts the given one in its place. */
    private function replace(string $table, string $column, array $condition, string $message): void
    {
        $name = "{$table}_code_format_chk";
        $this->drop($table, $name);

        if (DB::getDriverName() === 'sqlite') {
            $new = $this->prefixNew($condition[1], $column);
            DB::unprepared("CREATE TRIGGER {$name}_insert BEFORE INSERT ON {$table} FOR EACH ROW WHEN NOT ({$new}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            DB::unprepared("CREATE TRIGGER {$name}_update BEFORE UPDATE OF {$column} ON {$table} FOR EACH ROW WHEN NOT ({$new}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        if ($this->supportsCheck()) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$condition[0]})");
            return;
        }

        $new = $this->prefixNew($condition[0], $column);
        foreach (['insert' => 'BEFORE INSERT', 'update' => 'BEFORE UPDATE'] as $suffix => $event) {
            DB::unprepared("CREATE TRIGGER {$name}_{$suffix} {$event} ON {$table} FOR EACH ROW BEGIN IF NOT ({$new}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
        }
    }

    private function prefixNew(string $expr, string $column): string
    {
        return preg_replace('/\b' . preg_quote($column, '/') . '\b/', 'NEW.' . $column, $expr);
    }

    private function drop(string $table, string $name): void
    {
        if (DB::getDriverName() !== 'sqlite' && $this->supportsCheck()) {
            try {
                $how = $this->isMariaDb() || version_compare($this->versionNumber(), '8.0.19', '>=') ? 'CONSTRAINT' : 'CHECK';
                DB::statement("ALTER TABLE {$table} DROP {$how} {$name}");
            } catch (Throwable $e) {
                // already gone
            }
            return;
        }

        DB::unprepared("DROP TRIGGER IF EXISTS {$name}_insert");
        DB::unprepared("DROP TRIGGER IF EXISTS {$name}_update");
    }

    // ------------------------------------------------------------------ server version

    private function version(): string
    {
        return (string) DB::scalar('SELECT VERSION()');
    }

    private function isMariaDb(): bool
    {
        return stripos($this->version(), 'mariadb') !== false;
    }

    private function versionNumber(): string
    {
        $v = preg_replace('/^5\.5\.5-/', '', $this->version());
        preg_match('/\d+\.\d+\.\d+/', $v, $m);

        return $m[0] ?? '0.0.0';
    }

    private function supportsCheck(): bool
    {
        return $this->isMariaDb()
            ? version_compare($this->versionNumber(), '10.2.1', '>=')
            : version_compare($this->versionNumber(), '8.0.16', '>=');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * More rules enforced by the database itself, so that no route, script or manual edit can
 * save a value the system does not know or a number that makes no sense:
 *
 *   Allowed words   head_staff_transfers.status, feedback_edits.kind, current_statuses.category
 *   Number ranges   age_brackets (minimum age 0-120, maximum not below the minimum, at most 120),
 *                   sort_order of the lookup lists (not negative), the feedback windows
 *                   (1-168 hours and 1-120 minutes, the same limits the settings form has) and
 *                   the rating kept in an edit history (1-5, like the rating itself)
 *
 * A text column with a CHECK is used instead of ENUM: it works the same on MySQL,
 * MariaDB and SQLite, and adding a value later is a small migration, not a column rewrite.
 *
 * Before adding anything the migration checks every stored row; if some already break a
 * rule it stops, changes NOTHING and lists them. MySQL 8.0.16+ and MariaDB 10.2.1+ get
 * CHECK constraints; older MySQL (which ignores CHECK) and SQLite get triggers instead.
 */
return new class extends Migration
{
    public const TRANSFER_STATUSES = ['pending', 'accepted', 'cancelled', 'expired'];

    public const FEEDBACK_EDIT_KINDS = ['rating', 'absence'];

    /** The same list as App\Models\CurrentStatus::CATEGORIES (a test keeps the two equal). */
    public const STATUS_CATEGORIES = ['employment', 'household', 'economic', 'sector', 'other'];

    /** Rules for a lookup list's display order. */
    private const LOOKUPS = ['age_brackets', 'civil_statuses', 'current_statuses', 'name_suffixes'];

    /** [table, key, columns used, condition for a VALID row, message]. {col} marks a column. */
    private function rules(): array
    {
        $list = fn (array $words) => "'" . implode("','", $words) . "'";

        $rules = [
            ['head_staff_transfers', 'status_values', ['status'], "{status} IN ({$list(self::TRANSFER_STATUSES)})", 'Transfer status is not recognised.'],
            ['feedback_edits', 'kind_values', ['kind'], "{kind} IN ({$list(self::FEEDBACK_EDIT_KINDS)})", 'Feedback history kind is not recognised.'],
            ['current_statuses', 'category_values', ['category'], "{category} IN ({$list(self::STATUS_CATEGORIES)})", 'Status category is not recognised.'],

            ['age_brackets', 'min_age_range', ['min_age'], '{min_age} >= 0 AND {min_age} <= 120', 'Minimum age must be from 0 to 120.'],
            ['age_brackets', 'max_age_range', ['max_age', 'min_age'], '{max_age} IS NULL OR ({max_age} >= {min_age} AND {max_age} <= 120)', 'Maximum age cannot be below the minimum or above 120.'],

            ['feedback', 'submit_window_range', ['close_after_hours'], '{close_after_hours} BETWEEN 1 AND 168', 'The feedback submit window must be from 1 to 168 hours.'],
            ['feedback', 'edit_window_range', ['edit_window_minutes'], '{edit_window_minutes} BETWEEN 1 AND 120', 'The feedback edit window must be from 1 to 120 minutes.'],
            ['feedback_edits', 'rating_range', ['rating'], '{rating} IS NULL OR {rating} BETWEEN 1 AND 5', 'Rating must be from 1 to 5.'],
        ];

        foreach (self::LOOKUPS as $table) {
            $rules[] = [$table, 'sort_order_not_negative', ['sort_order'], '{sort_order} >= 0', 'Sort order cannot be negative.'];
        }

        return $rules;
    }

    public function up(): void
    {
        $this->assertStoredRowsAreValid();

        foreach ($this->rules() as [$table, $key, $columns, $condition, $message]) {
            $this->lock($table, $key, $columns, $condition, $message);
        }
    }

    public function down(): void
    {
        foreach ($this->rules() as [$table, $key]) {
            $this->unlock($table, $key);
        }
    }

    // ------------------------------------------------------------------ pre-flight

    private function assertStoredRowsAreValid(): void
    {
        $problems = [];

        foreach ($this->rules() as [$table, $key, $columns, $condition, $message]) {
            $where = 'NOT (' . $this->expr($condition, '') . ')';
            $count = DB::table($table)->whereRaw($where)->count();
            if ($count === 0) {
                continue;
            }
            $ids = DB::table($table)->whereRaw($where)->orderBy('id')->limit(5)->pluck('id')->all();
            $values = DB::table($table)->whereRaw($where)->distinct()->limit(5)->pluck($columns[0])->map(fn ($v) => "'" . $v . "'")->implode(', ');
            $problems[] = "{$table} ({$key}): {$count} row(s), e.g. #" . implode(', #', $ids) . " -- {$message} Found: {$values}.";
        }

        if ($problems) {
            throw new RuntimeException(
                "Cannot lock these rules: some stored rows already break them. Correct these rows and run the migration again; nothing was changed.\n  "
                . implode("\n  ", $problems)
            );
        }
    }

    // ------------------------------------------------------------------ building SQL

    /** The valid-condition for this database, with {col} turned into `col` (or NEW.`col`). */
    private function expr(string|array $condition, string $prefix): string
    {
        if (is_array($condition)) {
            $condition = DB::getDriverName() === 'sqlite' ? $condition[1] : $condition[0];
        }

        return preg_replace('/\{([a-z_]+)\}/', $prefix . '`$1`', $condition);
    }

    private function lock(string $table, string $key, array $columns, string|array $condition, string $message): void
    {
        $name = "{$table}_{$key}_chk";
        $new  = $this->expr($condition, 'NEW.');

        if (DB::getDriverName() === 'sqlite') {
            $of = implode(', ', array_map(fn ($c) => "`{$c}`", $columns));
            DB::unprepared("CREATE TRIGGER {$name}_insert BEFORE INSERT ON {$table} FOR EACH ROW WHEN NOT ({$new}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            DB::unprepared("CREATE TRIGGER {$name}_update BEFORE UPDATE OF {$of} ON {$table} FOR EACH ROW WHEN NOT ({$new}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        if ($this->supportsCheck()) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK (" . $this->expr($condition, '') . ')');
            return;
        }

        foreach (['insert' => 'BEFORE INSERT', 'update' => 'BEFORE UPDATE'] as $suffix => $event) {
            DB::unprepared("CREATE TRIGGER {$name}_{$suffix} {$event} ON {$table} FOR EACH ROW BEGIN IF NOT ({$new}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
        }
    }

    private function unlock(string $table, string $key): void
    {
        $name = "{$table}_{$key}_chk";

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
        $v = preg_replace('/^5\.5\.5-/', '', $this->version());   // MariaDB's replication-compatible prefix
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

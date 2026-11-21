<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Locks the file type of every stored attachment at the database, so that a path
 * to any other kind of file (.gif, .webp, .svg, .php, .exe ...) cannot be saved by
 * any route: a forgotten validation rule, a script, an import or a manual edit.
 *
 *   photos and the resident's validation ID   .jpg  .jpeg  .png
 *   expense receipts                          .jpg  .jpeg  .png  .pdf
 *
 * A list of paths (the "extra" photo/receipt columns) is held to the same rule,
 * element by element, and to at most ten files.
 *
 * These are triggers, not CHECK constraints, on purpose: they judge only what is
 * being written (a new row, or a changed value). Files already stored, which an
 * earlier version of the app accepted as .gif or .webp, are left exactly as they
 * are and the rows holding them can still be edited for any other reason.
 *
 * Needs the TRIGGER privilege (and, when MySQL's binary log is on, either SUPER or
 * log_bin_trust_function_creators = 1).
 */
return new class extends Migration
{
    private const IMAGE   = ['jpg', 'jpeg', 'png'];
    private const RECEIPT = ['jpg', 'jpeg', 'png', 'pdf'];
    private const MAX_LIST = 10;

    /** [table, column, allowed extensions, is a JSON list] */
    private function targets(): array
    {
        return [
            ['users',                       'validation_id',              self::IMAGE,   false],
            ['inventory_items',             'photo_path',                 self::IMAGE,   false],
            ['event_inventory_releases',    'evidence_photo_path',        self::IMAGE,   false],
            ['event_inventory_releases',    'undo_photo_path',            self::IMAGE,   false],
            ['event_inventory_releases',    'extra_evidence_photo_paths', self::IMAGE,   true],
            ['event_inventory_release_undos', 'photo_path',               self::IMAGE,   false],
            ['inventory_unit_logs',         'photo_path',                 self::IMAGE,   false],
            ['inventory_unit_logs',         'extra_photo_paths',          self::IMAGE,   true],
            ['event_expenses',              'receipt_path',               self::RECEIPT, false],
            ['event_expenses',              'extra_receipt_paths',        self::RECEIPT, true],
        ];
    }

    public function up(): void
    {
        foreach ($this->targets() as [$table, $column, $exts, $isList]) {
            if (!Schema::hasColumn($table, $column)) {
                continue;
            }
            $this->drop($table, $column);   // safe to run twice

            $message = in_array('pdf', $exts, true)
                ? 'Only JPG, PNG or PDF files are allowed.'
                : 'Only JPG or PNG files are allowed.';
            $bad = $isList ? $this->badList($column, $exts) : $this->badValue("NEW.{$column}", $exts);

            try {
                $this->create($table, $column, $bad, $message);
            } catch (\Throwable $e) {
                throw new RuntimeException(
                    "Could not lock the file types of {$table}.{$column}: " . $e->getMessage()
                    . "\nThe database user needs the TRIGGER privilege (and SUPER, or log_bin_trust_function_creators=1, when the binary log is on).",
                    0,
                    $e
                );
            }
        }
    }

    public function down(): void
    {
        foreach ($this->targets() as [$table, $column]) {
            if (Schema::hasColumn($table, $column)) {
                $this->drop($table, $column);
            }
        }
    }

    // ----------------------------------------------------------- conditions

    private function sqlite(): bool
    {
        return DB::getDriverName() === 'sqlite';
    }

    /** True (the value is NOT an allowed file) for a non-null path that does not end in an allowed extension. */
    private function badValue(string $expr, array $exts): string
    {
        if ($this->sqlite()) {
            $no = implode(' AND ', array_map(fn ($e) => "lower({$expr}) NOT GLOB '*.{$e}'", $exts));
            return "({$expr} IS NOT NULL AND {$no})";
        }

        return "({$expr} IS NOT NULL AND LOWER({$expr}) NOT REGEXP '[.](" . implode('|', $exts) . ")$')";
    }

    /** True when the JSON list holds too many files, or any file that is not allowed. */
    private function badList(string $column, array $exts): string
    {
        $parts = [];
        $max = self::MAX_LIST;
        $parts[] = $this->sqlite() ? "json_array_length(NEW.{$column}) > {$max}" : "JSON_LENGTH(NEW.{$column}) > {$max}";
        for ($i = 0; $i < $max; $i++) {
            $item = $this->sqlite()
                ? "json_extract(NEW.{$column}, '\$[{$i}]')"
                : "JSON_UNQUOTE(JSON_EXTRACT(NEW.{$column}, '\$[{$i}]'))";
            $parts[] = $this->badValue($item, $exts);
        }

        return "(NEW.{$column} IS NOT NULL AND (" . implode(' OR ', $parts) . '))';
    }

    // ------------------------------------------------------------- triggers

    private function name(string $table, string $column, string $suffix): string
    {
        return "lock_{$table}_{$column}_{$suffix}";
    }

    private function create(string $table, string $column, string $bad, string $message): void
    {
        $ins = $this->name($table, $column, 'i');
        $upd = $this->name($table, $column, 'u');

        if ($this->sqlite()) {
            DB::unprepared("CREATE TRIGGER {$ins} BEFORE INSERT ON {$table} FOR EACH ROW WHEN {$bad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            DB::unprepared("CREATE TRIGGER {$upd} BEFORE UPDATE OF {$column} ON {$table} FOR EACH ROW WHEN NEW.{$column} IS NOT OLD.{$column} AND {$bad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        DB::unprepared("CREATE TRIGGER {$ins} BEFORE INSERT ON {$table} FOR EACH ROW BEGIN IF {$bad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
        DB::unprepared("CREATE TRIGGER {$upd} BEFORE UPDATE ON {$table} FOR EACH ROW BEGIN IF NOT (NEW.{$column} <=> OLD.{$column}) AND {$bad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
    }

    private function drop(string $table, string $column): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS ' . $this->name($table, $column, 'i'));
        DB::unprepared('DROP TRIGGER IF EXISTS ' . $this->name($table, $column, 'u'));
    }
};

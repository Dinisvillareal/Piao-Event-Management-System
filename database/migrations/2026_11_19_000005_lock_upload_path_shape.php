<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tightens the file-type lock of 2026_11_19_000004: a stored path must now also have
 * the SHAPE the app gives every file it saves, not just end in an allowed extension.
 *
 *   validation_ids/1731900000_name.png                    validation ID
 *   expense_receipts/1731900000_name.pdf                  receipt
 *   release_evidence_photos/1731900000_name.jpg           return evidence
 *   release_undo_photos/1731900000_name.jpg               undo evidence
 *   inventory_photos/1731900000_Ab3xYz_name.png           inventory photo
 *   inventory_unit_photos/1731900000_Ab3xYz_name.png      lost/found evidence
 *
 * i.e. the right folder, a 10-digit timestamp, (for the last two) 6 random letters or
 * digits, then the cleaned original name and the extension, and no further folders (no ../). A hand-typed "jjj.png" is
 * refused. This cannot prove the file exists (a database cannot open the storage folder;
 * `php artisan uploads:check` does that), it only stops paths the app could never have written.
 *
 * Pictures already saved are untouched: a trigger judges only a new row or a changed value.
 * In a list of paths, files that were already in the list are not judged again, so a record
 * that holds an older file can still gain a new photo. The folder name is matched without regard
 * to letter case on MySQL.
 */
return new class extends Migration
{
    private const IMAGE   = ['jpg', 'jpeg', 'png'];
    private const RECEIPT = ['jpg', 'jpeg', 'png', 'pdf'];
    private const MAX_LIST = 10;

    /** [table, column, allowed extensions, folder, random part in the name, JSON list] */
    private function targets(): array
    {
        return [
            ['users',                         'validation_id',              self::IMAGE,   'validation_ids',          false, false],
            ['inventory_items',               'photo_path',                 self::IMAGE,   'inventory_photos',        true,  false],
            ['event_inventory_releases',      'evidence_photo_path',        self::IMAGE,   'release_evidence_photos', false, false],
            ['event_inventory_releases',      'undo_photo_path',            self::IMAGE,   'release_undo_photos',     false, false],
            ['event_inventory_releases',      'extra_evidence_photo_paths', self::IMAGE,   'release_evidence_photos', false, true],
            ['event_inventory_release_undos', 'photo_path',                 self::IMAGE,   'release_undo_photos',     false, false],
            ['inventory_unit_logs',           'photo_path',                 self::IMAGE,   'inventory_unit_photos',   true,  false],
            ['inventory_unit_logs',           'extra_photo_paths',          self::IMAGE,   'inventory_unit_photos',   true,  true],
            ['event_expenses',                'receipt_path',               self::RECEIPT, 'expense_receipts',        false, false],
            ['event_expenses',                'extra_receipt_paths',        self::RECEIPT, 'expense_receipts',        false, true],
        ];
    }

    public function up(): void
    {
        $this->rebuild(true);
    }

    /** Back to the extension-only rule of 2026_11_19_000004. */
    public function down(): void
    {
        $this->rebuild(false);
    }

    private function rebuild(bool $shape): void
    {
        foreach ($this->targets() as [$table, $column, $exts, $folder, $random, $isList]) {
            if (!Schema::hasColumn($table, $column)) {
                continue;
            }
            foreach (['i', 'u'] as $suffix) {
                DB::unprepared("DROP TRIGGER IF EXISTS lock_{$table}_{$column}_{$suffix}");
            }

            $message = in_array('pdf', $exts, true)
                ? 'Only JPG, PNG or PDF files are allowed.'
                : 'Only JPG or PNG files are allowed.';
            if ($shape) {
                $message = substr($message, 0, -1) . ', saved by the app.';
            }

            $make = fn (string $expr, bool $withOld) => $this->bad($expr, $exts, $shape ? [$folder, $random] : null, $withOld ? $column : null);

            if ($isList) {
                $insBad = $this->badList($column, $make, false);
                $updBad = $this->badList($column, $make, true);
            } else {
                $insBad = $make("NEW.{$column}", false);
                $updBad = $make("NEW.{$column}", false);
            }

            try {
                $this->create($table, $column, $insBad, $updBad, $message);
            } catch (\Throwable $e) {
                throw new RuntimeException(
                    "Could not lock the file paths of {$table}.{$column}: " . $e->getMessage()
                    . "\nThe database user needs the TRIGGER privilege (and SUPER, or log_bin_trust_function_creators=1, when the binary log is on).",
                    0,
                    $e
                );
            }
        }
    }

    // ----------------------------------------------------------- conditions

    private function sqlite(): bool
    {
        return DB::getDriverName() === 'sqlite';
    }

    /**
     * True when $expr is a non-null path that is not allowed: wrong extension and, when
     * $shape = [folder, random] is given, not the shape the app writes.
     * With $oldList (a JSON column name) a path that is already in OLD.<column> is let through.
     */
    private function bad(string $expr, array $exts, ?array $shape, ?string $oldList): string
    {
        if ($this->sqlite()) {
            $noExt = implode(' AND ', array_map(fn ($e) => "lower({$expr}) NOT GLOB '*.{$e}'", $exts));
            $conds = [$noExt];
            if ($shape) {
                [$folder, $random] = $shape;
                $glob = $folder . '/' . str_repeat('[0-9]', 10) . '_' . ($random ? str_repeat('[A-Za-z0-9]', 6) . '_' : '') . '*';
                $conds[] = "{$expr} NOT GLOB '{$glob}'";
                $conds[] = "{$expr} GLOB '*/*/*'";          // no further folders, so no ../
            }
            $bad = '(' . implode(' OR ', array_map(fn ($c) => "({$c})", $conds)) . ')';
            $known = $oldList ? " AND NOT EXISTS (SELECT 1 FROM json_each(OLD.{$oldList}) WHERE value = {$expr})" : '';

            return "({$expr} IS NOT NULL AND {$bad}{$known})";
        }

        $conds = ["LOWER({$expr}) NOT REGEXP '[.](" . implode('|', $exts) . ")$'"];
        if ($shape) {
            [$folder, $random] = $shape;
            $conds[] = "{$expr} NOT REGEXP '^{$folder}/[0-9]{10}_" . ($random ? '[A-Za-z0-9]{6}_' : '') . "[^/]*$'";
        }
        $known = $oldList ? " AND NOT IFNULL(JSON_CONTAINS(OLD.{$oldList}, JSON_QUOTE({$expr})), 0)" : '';

        return "({$expr} IS NOT NULL AND (" . implode(' OR ', $conds) . "){$known})";
    }

    /** A list of paths: too many files, or any element that is not allowed. */
    private function badList(string $column, callable $make, bool $withOld): string
    {
        $max = self::MAX_LIST;
        $parts = [$this->sqlite() ? "json_array_length(NEW.{$column}) > {$max}" : "JSON_LENGTH(NEW.{$column}) > {$max}"];
        for ($i = 0; $i < $max; $i++) {
            $item = $this->sqlite()
                ? "json_extract(NEW.{$column}, '\$[{$i}]')"
                : "JSON_UNQUOTE(JSON_EXTRACT(NEW.{$column}, '\$[{$i}]'))";
            $parts[] = $make($item, $withOld);
        }

        return "(NEW.{$column} IS NOT NULL AND (" . implode(' OR ', $parts) . '))';
    }

    // ------------------------------------------------------------- triggers

    private function create(string $table, string $column, string $insBad, string $updBad, string $message): void
    {
        $ins = "lock_{$table}_{$column}_i";
        $upd = "lock_{$table}_{$column}_u";

        if ($this->sqlite()) {
            DB::unprepared("CREATE TRIGGER {$ins} BEFORE INSERT ON {$table} FOR EACH ROW WHEN {$insBad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            DB::unprepared("CREATE TRIGGER {$upd} BEFORE UPDATE OF {$column} ON {$table} FOR EACH ROW WHEN NEW.{$column} IS NOT OLD.{$column} AND {$updBad} BEGIN SELECT RAISE(ABORT, '{$message}'); END");
            return;
        }

        DB::unprepared("CREATE TRIGGER {$ins} BEFORE INSERT ON {$table} FOR EACH ROW BEGIN IF {$insBad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
        DB::unprepared("CREATE TRIGGER {$upd} BEFORE UPDATE ON {$table} FOR EACH ROW BEGIN IF NOT (NEW.{$column} <=> OLD.{$column}) AND {$updBad} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}'; END IF; END");
    }
};

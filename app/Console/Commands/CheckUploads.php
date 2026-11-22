<?php

namespace App\Console\Commands;

use App\Support\Uploads;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Audits every attachment the database points to. The database rule only reads the
 * end of a path (it cannot open a file), so a row written by hand with "jjj.png" is
 * accepted even though no such picture exists. This command finds those rows, and
 * any file that is missing, empty, or not what its name says. It changes nothing.
 *
 *   php artisan uploads:check              lists up to 100 problems
 *   php artisan uploads:check --limit=0    lists all of them
 *
 * Exit code 0 when every attachment is fine, 1 when something needs attention.
 */
class CheckUploads extends Command
{
    protected $signature = 'uploads:check {--limit=100 : Most problems to list (0 = all); the totals always count every one}';

    protected $description = 'Report attachments whose file is missing or is not the JPG/PNG/PDF the database says it is (changes nothing)';

    private const REAL_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'];

    public function handle(): int
    {
        $disk = Storage::disk('public');
        $checked = 0;
        $problems = [];

        foreach (Uploads::columns() as [$table, $column, $allowed, $isList]) {
            if (!Schema::hasColumn($table, $column)) {
                continue;
            }

            DB::table($table)->whereNotNull($column)->select(['id', $column])->orderBy('id')
                ->each(function ($row) use ($disk, $table, $column, $allowed, $isList, &$checked, &$problems) {
                    $paths = $isList ? (array) json_decode((string) $row->{$column}, true) : [$row->{$column}];

                    foreach ($paths as $path) {
                        $checked++;
                        $issue = is_string($path) ? $this->inspect($disk, $path, $allowed) : 'not a file path';
                        if ($issue !== null) {
                            $problems[] = [$table, $row->id, $column, is_string($path) ? $path : json_encode($path), $issue];
                        }
                    }
                });
        }

        if ($problems === []) {
            $this->info("All {$checked} attachments are fine.");

            return self::SUCCESS;
        }

        $limit = max(0, (int) $this->option('limit'));
        $shown = $limit > 0 ? array_slice($problems, 0, $limit) : $problems;
        $this->table(['Table', 'Row', 'Column', 'File', 'Problem'], $shown);

        if (count($shown) < count($problems)) {
            $this->line('... and ' . (count($problems) - count($shown)) . ' more (use --limit=0 to list them all).');
        }
        $this->warn(count($problems) . " of {$checked} attachments need attention. Nothing was changed.");

        return self::FAILURE;
    }

    /**
     * The type of the file read from its first bytes. (The storage layer's own mimeType() falls
     * back to the file name when the content is unclear, which would let a text file called
     * .png pass.)
     */
    private function contentType($disk, string $path): string
    {
        $stream = $disk->readStream($path);
        $head = is_resource($stream) ? (string) fread($stream, 4096) : '';
        if (is_resource($stream)) {
            fclose($stream);
        }

        return (string) (new \finfo(FILEINFO_MIME_TYPE))->buffer($head);
    }

    /** What is wrong with the file at $path, or null when it is a real, allowed file. */
    private function inspect($disk, string $path, array $allowed): ?string
    {
        $ext = Uploads::normalize(pathinfo($path, PATHINFO_EXTENSION));
        $allowedNames = strtoupper(implode('/', array_unique(array_map([Uploads::class, 'normalize'], $allowed))));

        if (!in_array($ext, array_map([Uploads::class, 'normalize'], $allowed), true)) {
            return $ext === ''
                ? "has no file extension (only {$allowedNames} allowed here)"
                : ".{$ext} is not allowed here (only {$allowedNames}); saved before the lock?";
        }

        try {
            if (!$disk->exists($path)) {
                return 'the file is missing from storage';
            }
            if ($disk->size($path) === 0) {
                return 'the file is empty';
            }
            $mime = $this->contentType($disk, $path);
        } catch (\Throwable $e) {
            return 'the file could not be read: ' . $e->getMessage();
        }

        $real = self::REAL_TYPES[$mime] ?? null;
        if ($real === null || !in_array($real, array_map([Uploads::class, 'normalize'], $allowed), true)) {
            return "the content is {$mime}, not {$allowedNames}";
        }
        if ($real !== $ext) {
            return "named .{$ext} but the content is a " . strtoupper($real);
        }

        return null;
    }
}

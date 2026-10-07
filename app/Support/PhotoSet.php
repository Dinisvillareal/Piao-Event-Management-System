<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Works out the final list of photos for a record that can hold several
 * (inventory items, return evidence). The first photo stays in the record's
 * original single-photo column (it is the "cover"); the rest live in a JSON
 * column, so everything that only knows about one photo keeps working.
 *
 * The request describes the result instead of a list of edits:
 *   - keep_photos[]: indexes (into the record's current photo list) to keep,
 *     in the order they should appear.
 *   - photos[]: newly picked files, appended after the kept ones.
 * Anything not kept is returned in `removed` so the caller can delete the
 * files once the record has been saved.
 */
class PhotoSet
{
    public const MAX = 5;

    /**
     * Checks the request against the current list without touching any file,
     * so callers can fail early (before changing anything else).
     *
     * @param  string[]  $current  the record's current photo paths, cover first
     * @return array{kept: string[], files: array}
     */
    public static function plan(array $current, Request $request, int $max = self::MAX, string $keepKey = 'keep_photos', string $filesKey = 'photos'): array
    {
        $current = array_values($current);
        $kept = [];
        foreach ((array) $request->input($keepKey, []) as $i) {
            $path = $current[(int) $i] ?? null;
            if ($path !== null && !in_array($path, $kept, true)) {
                $kept[] = $path;
            }
        }

        $files = array_values(array_filter((array) $request->file($filesKey, [])));

        if (count($kept) + count($files) > $max) {
            throw ValidationException::withMessages([
                $filesKey => "You can attach up to {$max} files.",
            ]);
        }

        return ['kept' => $kept, 'files' => $files];
    }

    /**
     * @param  string[]  $current  the record's current photo paths, cover first
     * @param  callable  $upload   stores one uploaded file and returns its path
     * @return array{final: string[], removed: string[]}
     */
    public static function resolve(array $current, Request $request, callable $upload, int $max = self::MAX, string $keepKey = 'keep_photos', string $filesKey = 'photos'): array
    {
        $plan = self::plan($current, $request, $max, $keepKey, $filesKey);

        return [
            'final' => array_merge($plan['kept'], array_map($upload, $plan['files'])),
            'removed' => array_values(array_diff(array_values($current), $plan['kept'])),
        ];
    }
}

<?php

namespace App\Support;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\Request;

/**
 * Small helpers shared by every list screen that filters, sorts and pages in
 * the database (instead of downloading everything and filtering in the
 * browser): page size, forgiving word-by-word search, and one response shape
 * -- { data, meta: { total, page, per_page, last_page }, ...extra }.
 */
class Paged
{
    public static function perPage(Request $request, int $default = 10, int $max = 100): int
    {
        return max(1, min($max, (int) $request->input('per_page', $default)));
    }

    public static function page(Request $request): int
    {
        return max(1, (int) $request->input('page', 1));
    }

    /** Search words (lower-cased, whitespace-split), like the browser's matchesSearch(). */
    public static function tokens(?string $query): array
    {
        $q = trim(preg_replace('/\s+/u', ' ', mb_strtolower((string) $query)));

        return $q === '' ? [] : explode(' ', $q);
    }

    /** "%word%" with LIKE wildcards in the word escaped. */
    public static function like(string $word): string
    {
        return '%' . addcslashes($word, '\\%_') . '%';
    }

    /** Standard JSON body for a paginated list. */
    public static function body(LengthAwarePaginator $paginator, $rows, array $extra = []): array
    {
        return array_merge([
            'data' => $rows,
            'meta' => [
                'total' => $paginator->total(),
                'page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ], $extra);
    }
}

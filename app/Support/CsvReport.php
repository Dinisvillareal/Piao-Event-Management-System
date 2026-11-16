<?php

namespace App\Support;

use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The one CSV layout every exported report uses, so a file from any screen looks the same:
 *
 *   line 1   report title
 *   line 2   the filters that were applied  |  "Generated <date and time>"
 *   line 3   (blank)
 *   line 4   column headings
 *   line 5+  the data rows
 *
 * The file starts with a UTF-8 byte-order mark so Excel reads accents and the peso sign
 * correctly, and any text cell that starts with = + - or @ gets a leading apostrophe so
 * spreadsheet software can't run it as a formula (e.g. a name typed as =HYPERLINK(...)).
 */
class CsvReport
{
    public static function stream(string $title, string $filterLine, array $header, iterable $rows, ?string $fileName = null): StreamedResponse
    {
        $fileName ??= Str::slug($title) . '-' . now()->format('Ymd') . '.csv';
        $generated = 'Generated ' . now()->format('F j, Y g:i A');

        return response()->streamDownload(function () use ($title, $filterLine, $header, $rows, $generated) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, [$title]);
            fputcsv($out, [$filterLine, $generated]);
            fputcsv($out, []);
            fputcsv($out, $header);
            foreach ($rows as $row) {
                fputcsv($out, array_map([self::class, 'safeCell'], $row));
            }
            fclose($out);
        }, $fileName, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** Neutralises spreadsheet formulas in text cells; numbers and empty cells pass through. */
    public static function safeCell($value)
    {
        return is_string($value) && $value !== '' && in_array($value[0], ['=', '+', '-', '@'], true) ? "'" . $value : $value;
    }
}

<?php

namespace App\Http\Controllers;

use App\Support\BarangayOfficials;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;

/**
 * PDF download of the staff "Residents Master List".
 *
 * The page already holds the exact rows the staff member is looking at (after
 * the search + membership filter), already formatted for display, so it posts
 * those rows here and this renders them on the barangay letterhead with the
 * Captain / Secretary signature block -- the PDF always matches the screen
 * and the Excel export column for column. Excel is built in the browser
 * (resources/js/lib/residentsExport.ts).
 */
class ResidentExportController extends Controller
{
    /** key => [header, relative width, centered]. Same keys/order as RESIDENT_EXPORT_COLUMNS in residentsExport.ts. */
    public const COLUMNS = [
        'no' => ['No.', 5, true],
        'id' => ['ID Number', 10, false],
        'name' => ['Resident', 21, false],
        'gender' => ['Gender', 7, true],
        'age' => ['Age', 5, true],
        'contact' => ['Contact', 12, false],
        'address' => ['Address', 19, false],
        'household' => ['Household', 10, false],
        'membership' => ['Membership', 11, false],
    ];

    public function pdf(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $data = $request->validate([
            // The columns the staff member picked, in print order; each row holds one value per column.
            'columns' => ['required', 'array', 'min:1', 'max:' . count(self::COLUMNS)],
            'columns.*' => ['string', 'in:' . implode(',', array_keys(self::COLUMNS))],
            'rows' => ['present', 'array', 'max:5000'],
            'rows.*' => ['array'],
            'rows.*.*' => ['nullable', 'string', 'max:500'],
            'filter' => ['nullable', 'string', 'max:200'],
            // Optional opening message ("I. MESSAGE"); omitted when the staff member turns it off.
            'message' => ['nullable', 'array', 'max:8'],
            'message.*' => ['string', 'max:2000'],
        ]);

        $keys = array_values(array_unique($data['columns']));
        $columns = array_map(fn ($k) => self::COLUMNS[$k][0], $keys);
        $centered = array_keys(array_filter($keys, fn ($k) => self::COLUMNS[$k][2]));
        $weightTotal = array_sum(array_map(fn ($k) => self::COLUMNS[$k][1], $keys));
        $widths = array_map(fn ($k) => round(self::COLUMNS[$k][1] / $weightTotal * 100, 2), $keys);

        // One cell per chosen column, so a stray value can't reshape the table.
        $rows = collect($data['rows'])->map(function ($row) use ($keys) {
            $row = array_values($row);
            return array_map(fn ($i) => (string) ($row[$i] ?? ''), array_keys($keys));
        })->values()->all();

        $pdf = Pdf::loadView('residents.export', [
            'columns' => $columns,
            'widths' => $widths,
            'centered' => $centered,
            'rows' => $rows,
            'message' => array_values($data['message'] ?? []),
            'filterSummary' => $data['filter'] ?? '',
            'officials' => BarangayOfficials::current(),
            'printedOn' => now()->format('F j, Y'),
        ])->setPaper('a4', count($keys) <= 5 ? 'portrait' : 'landscape');

        // "Page X of Y" bottom-right, same stamp as the other reports.
        $pdf->render();
        $canvas = $pdf->getCanvas();
        $fontMetrics = $pdf->getFontMetrics();
        $font = $fontMetrics->getFont('DejaVu Sans');
        $size = 8;
        $pageCount = (string) $canvas->get_page_count();
        $width = $fontMetrics->getTextWidth('Page ' . str_repeat('0', strlen($pageCount)) . ' of ' . $pageCount, $font, $size);
        $canvas->page_text(
            $canvas->get_width() - (12 * 72 / 25.4) - $width,
            $canvas->get_height() - 28,
            'Page {PAGE_NUM} of {PAGE_COUNT}',
            $font,
            $size,
            [0.55, 0.6, 0.6]
        );

        return $pdf->download('residents-master-list.pdf');
    }
}

<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support;
use Tests\TestCase;

/** The Residents Master List PDF: same table styling as the Activity Log Report (weighted columns, separate borders). */
class ResidentExportPdfTest extends TestCase
{
    use RefreshDatabase, Support;

    private function body(array $extra = []): array
    {
        return $extra + [
            'columns' => ['no', 'id', 'name', 'gender', 'age'],
            'rows' => [['1', 'PR-0001', 'Dela Cruz, Juan', 'Male', '34'], ['2', 'PR-0002', 'Santos, Ana', 'Female', '28']],
            'filter' => 'All records · 2 residents',
            'message' => [],
        ];
    }

    public function test_the_pdf_downloads_for_staff_and_is_refused_for_residents(): void
    {
        $response = $this->actingAs($this->staff())->post('/membership-residents/export/pdf', $this->body(), ['Accept' => 'application/pdf']);
        $response->assertOk();
        $this->assertStringStartsWith('%PDF', $response->getContent());

        $this->actingAs($this->makeUser('Resident'))->post('/membership-residents/export/pdf', $this->body(), ['Accept' => 'application/json'])->assertStatus(403);
    }

    public function test_the_columns_are_weighted_not_equal_and_the_borders_are_the_cheap_kind(): void
    {
        $html = view('residents.export', [
            'columns' => ['No.', 'Resident'], 'widths' => [10, 90], 'centered' => [0], 'rows' => [['1', 'Dela Cruz, Juan']],
            'message' => [], 'filterSummary' => '', 'officials' => [], 'printedOn' => 'today',
        ])->render();

        $this->assertStringContainsString('<th class="center" style="width: 10%;">No.</th>', $html);
        $this->assertStringContainsString('style="width: 90%;">Dela Cruz, Juan</td>', $html);
        $this->assertStringContainsString('border-collapse: separate', $html);
        $this->assertSame(1, substr_count($html, '<thead>'));
    }
}

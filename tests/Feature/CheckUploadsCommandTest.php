<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * php artisan uploads:check finds attachments the database points to that are not
 * really there (the database rule can only read a path's ending, not open a file).
 */
class CheckUploadsCommandTest extends TestCase
{
    use RefreshDatabase, Support;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    private const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    private const PDF = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";

    private static int $n = 0;

    /** The command audits data that got in around the locks (old rows, direct edits), so write without them. */
    protected function setUp(): void
    {
        parent::setUp();
        (require database_path('migrations/2026_11_19_000005_lock_upload_path_shape.php'))->down();
        (require database_path('migrations/2026_11_19_000004_lock_upload_file_types.php'))->down();
    }

    private function item(?string $photo, ?string $name = null): int
    {
        return DB::table('inventory_items')->insertGetId(['name' => $name ?? 'Item ' . ++self::$n, 'photo_path' => $photo]);
    }

    private function user(?string $id): int
    {
        $n = ++self::$n;

        return DB::table('users')->insertGetId([
            'user_code' => sprintf('PR-%04d', 7000 + $n), 'first_name' => "F{$n}", 'last_name' => "L{$n}", 'contact_number' => '09171234567',
            'role' => 'Resident', 'validation_id' => $id,
        ]);
    }

    private function expense(?string $receipt, ?array $extra = null): int
    {
        $event = DB::table('events')->insertGetId(['name' => 'E' . ++self::$n, 'description' => 'd', 'location' => 'Hall', 'event_start' => now()]);

        return DB::table('event_expenses')->insertGetId([
            'event_id' => $event, 'item' => 'x', 'amount' => 10, 'receipt_path' => $receipt,
            'extra_receipt_paths' => $extra === null ? null : json_encode($extra),
        ]);
    }

    /** Runs the command and returns [exit code, everything it printed]. */
    private function run_(string $args = ''): array
    {
        $code = Artisan::call('uploads:check' . ($args ? " {$args}" : ''));

        return [$code, Artisan::output()];
    }

    public function test_it_is_quiet_when_every_file_is_real(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('validation_ids/a.png', base64_decode(self::PNG));
        Storage::disk('public')->put('expense_receipts/r.pdf', self::PDF);
        $this->user('validation_ids/a.png');
        $this->expense('expense_receipts/r.pdf');
        $this->item(null);

        [$code, $out] = $this->run_();
        $this->assertSame(0, $code);
        $this->assertStringContainsString('All 2 attachments are fine.', $out);
    }

    public function test_a_path_typed_into_the_database_with_no_file_behind_it_is_reported(): void
    {
        Storage::fake('public');
        $id = $this->item('inventory_photos/jjj.png');   // the database accepts this: it ends in .png

        [$code, $out] = $this->run_();
        $this->assertSame(1, $code);
        foreach (['inventory_photos/jjj.png', 'missing from storage', '1 of 1 attachments need attention. Nothing was changed.'] as $needle) {
            $this->assertStringContainsString($needle, $out);
        }

        $this->assertSame('inventory_photos/jjj.png', DB::table('inventory_items')->find($id)->photo_path);   // read-only
    }

    public function test_a_file_that_is_not_what_its_name_says_is_reported(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('inventory_photos/fake.png', base64_decode(self::GIF));        // a GIF called .png
        Storage::disk('public')->put('inventory_photos/jpg-but-png.jpg', base64_decode(self::PNG)); // a PNG called .jpg
        Storage::disk('public')->put('inventory_photos/empty.png', '');
        Storage::disk('public')->put('inventory_photos/text.png', 'just some text');
        foreach (['fake.png', 'jpg-but-png.jpg', 'empty.png', 'text.png'] as $f) {
            $this->item('inventory_photos/' . $f);
        }

        [$code, $out] = $this->run_('--limit=0');
        $this->assertSame(1, $code);
        foreach (['image/gif', 'named .jpg but the content is a PNG', 'the file is empty', 'text/plain', '4 of 4 attachments need attention.'] as $needle) {
            $this->assertStringContainsString($needle, $out);
        }
    }

    public function test_lists_are_checked_one_file_at_a_time_and_a_pdf_is_fine_for_a_receipt_only(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('expense_receipts/ok.pdf', self::PDF);
        Storage::disk('public')->put('expense_receipts/ok.png', base64_decode(self::PNG));
        Storage::disk('public')->put('inventory_photos/doc.pdf', self::PDF);
        $this->expense('expense_receipts/ok.pdf', ['expense_receipts/ok.png', 'expense_receipts/gone.png']);
        $this->item('inventory_photos/doc.pdf');                                                      // a PDF where only a photo is allowed (possible only before the lock)

        [$code, $out] = $this->run_('--limit=0');
        $this->assertSame(1, $code);
        foreach (['expense_receipts/gone.png', '.pdf is not allowed here (only JPG/PNG)', '2 of 4 attachments need attention.'] as $needle) {
            $this->assertStringContainsString($needle, $out);
        }
    }

    public function test_files_saved_before_the_lock_are_listed_as_old_types(): void
    {
        Storage::fake('public');
        $this->item('inventory_photos/old.webp');

        [$code, $out] = $this->run_();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('.webp is not allowed here', $out);
    }

    public function test_the_list_can_be_shortened_but_the_total_is_always_complete(): void
    {
        Storage::fake('public');
        foreach (range(1, 5) as $i) {
            $this->item("inventory_photos/none{$i}.png");
        }

        [$code, $out] = $this->run_('--limit=2');
        $this->assertSame(1, $code);
        $this->assertStringContainsString('and 3 more', $out);
        $this->assertStringContainsString('5 of 5 attachments need attention.', $out);
    }
}

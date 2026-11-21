<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Support\Uploads;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * Attachments are locked to their file types at the database (migration
 * 2026_11_19_000004) and by the upload rules: photos and the validation ID are
 * JPG or PNG; expense receipts are JPG, PNG or one PDF.
 */
class UploadTypeLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    private const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    /** A real file on disk (not the test fake, which trusts the name): its type is read from its content. */
    private function realFile(string $name, string $base64): UploadedFile
    {
        $tmp = tempnam(sys_get_temp_dir(), 'up');
        file_put_contents($tmp, base64_decode($base64));

        return new UploadedFile($tmp, $name, 'application/octet-stream', null, true);
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000004_lock_upload_file_types.php');
    }

    private static int $n = 0;

    private function eventId(): int
    {
        return DB::table('events')->insertGetId(['name' => 'E' . ++self::$n, 'description' => 'd', 'location' => 'Hall', 'event_start' => now()]);
    }

    /** Inserts one row that carries $value in $column of $table; returns its id. */
    private function row(string $table, string $column, $value): int
    {
        $n = ++self::$n;
        $row = match ($table) {
            'users'                         => ['user_code' => sprintf('PR-%04d', 8000 + $n), 'first_name' => "F{$n}", 'last_name' => "L{$n}", 'contact_number' => '09171234567', 'role' => 'Resident'],
            'inventory_items'               => ['name' => "Item {$n}"],
            'event_expenses'                => ['event_id' => $this->eventId(), 'item' => "x{$n}", 'amount' => 10],
            'inventory_unit_logs'           => ['inventory_item_id' => $this->row('inventory_items', 'name', "Item u{$n}"), 'action' => 'found', 'quantity' => 1],
            'event_inventory_releases'      => (function () use ($n) {
                $event = $this->eventId();
                $item = $this->row('inventory_items', 'name', "Item r{$n}");
                $this->loanRow($event, $item, 1);   // a return is recorded against a loan

                return ['event_id' => $event, 'inventory_item_id' => $item, 'quantity' => 1];
            })(),
            'event_inventory_release_undos' => ['event_inventory_release_id' => $this->row('event_inventory_releases', 'quantity', 1), 'quantity' => 1],
        };
        $row[$column] = $value;

        return DB::table($table)->insertGetId($row);
    }

    private function refused(callable $fn): bool
    {
        try {
            $fn();
        } catch (QueryException) {
            return true;
        }

        return false;
    }

    /** The folder each column's files live in, and whether the app adds 6 random characters to the name. */
    private const SHAPES = [
        'users.validation_id'                          => ['validation_ids', false],
        'inventory_items.photo_path'                   => ['inventory_photos', true],
        'event_inventory_releases.evidence_photo_path' => ['release_evidence_photos', false],
        'inventory_unit_logs.photo_path'               => ['inventory_unit_photos', true],
        'event_expenses.receipt_path'                  => ['expense_receipts', false],
        'event_inventory_releases.extra_evidence_photo_paths' => ['release_evidence_photos', false],
        'inventory_unit_logs.extra_photo_paths'        => ['inventory_unit_photos', true],
        'event_expenses.extra_receipt_paths'           => ['expense_receipts', false],
    ];

    /** A path shaped the way the app writes it for that column, e.g. inventory_photos/1731900000_Ab3xYz_chair.png */
    private function path(string $table, string $column, string $ext = 'png', string $name = 'photo'): string
    {
        [$folder, $random] = self::SHAPES["{$table}.{$column}"];

        return "{$folder}/1731900000_" . ($random ? 'Ab3xYz_' : '') . "{$name}.{$ext}";
    }

    private const PHOTO_COLUMNS = [
        ['users', 'validation_id'],
        ['inventory_items', 'photo_path'],
        ['event_inventory_releases', 'evidence_photo_path'],
        ['inventory_unit_logs', 'photo_path'],
    ];

    /** Switch both locks off, as the database was before them, and back on. */
    private function locksOff(): void
    {
        (require database_path('migrations/2026_11_19_000005_lock_upload_path_shape.php'))->down();
        $this->migration()->down();
    }

    private function locksOn(): void
    {
        $this->migration()->up();
        (require database_path('migrations/2026_11_19_000005_lock_upload_path_shape.php'))->up();
    }

    // ------------------------------------------------------------ the database: file type

    public function test_every_photo_column_takes_jpg_jpeg_png_in_any_case_and_refuses_everything_else(): void
    {
        foreach (self::PHOTO_COLUMNS as [$table, $column]) {
            foreach (['jpg', 'JPEG', 'Png', 'png'] as $ext) {
                $this->row($table, $column, $this->path($table, $column, $ext));
            }
            $this->row($table, $column, null);

            foreach (['gif', 'webp', 'svg', 'pdf', 'php', 'png.php', 'exe', ''] as $bad) {
                $path = $this->path($table, $column, $bad, 'photo');
                $this->assertTrue($this->refused(fn () => $this->row($table, $column, $path)), "{$table}.{$column} accepted {$path}");
            }
            $this->assertTrue($this->refused(fn () => $this->row($table, $column, '')), "{$table}.{$column} accepted an empty path");
        }
    }

    public function test_receipts_also_take_pdf_but_nothing_else(): void
    {
        foreach (['pdf', 'PDF', 'jpg', 'png'] as $ext) {
            $this->row('event_expenses', 'receipt_path', $this->path('event_expenses', 'receipt_path', $ext));
        }
        foreach (['gif', 'docx', 'php', 'html'] as $bad) {
            $path = $this->path('event_expenses', 'receipt_path', $bad);
            $this->assertTrue($this->refused(fn () => $this->row('event_expenses', 'receipt_path', $path)), "receipt accepted {$path}");
        }
    }

    public function test_changing_a_stored_path_to_a_bad_one_is_refused_but_a_good_one_or_null_is_fine(): void
    {
        $id = $this->row('inventory_items', 'photo_path', $this->path('inventory_items', 'photo_path'));

        DB::table('inventory_items')->where('id', $id)->update(['photo_path' => $this->path('inventory_items', 'photo_path', 'jpg', 'other')]);
        DB::table('inventory_items')->where('id', $id)->update(['photo_path' => null]);
        $this->assertTrue($this->refused(fn () => DB::table('inventory_items')->where('id', $id)->update(['photo_path' => $this->path('inventory_items', 'photo_path', 'gif')])));
        $this->assertNull(DB::table('inventory_items')->find($id)->photo_path);
    }

    public function test_lists_of_files_are_checked_element_by_element_and_capped(): void
    {
        $r = fn ($ext) => $this->path('event_expenses', 'extra_receipt_paths', $ext);
        $this->row('event_expenses', 'extra_receipt_paths', json_encode([$r('pdf'), $r('png')]));
        $this->row('event_expenses', 'extra_receipt_paths', null);
        $u = fn ($ext) => $this->path('inventory_unit_logs', 'extra_photo_paths', $ext);
        $this->row('inventory_unit_logs', 'extra_photo_paths', json_encode([$u('jpg'), $u('png')]));

        $this->assertTrue($this->refused(fn () => $this->row('event_expenses', 'extra_receipt_paths', json_encode([$r('png'), $r('gif')]))));
        $this->assertTrue($this->refused(fn () => $this->row('inventory_unit_logs', 'extra_photo_paths', json_encode([$u('png'), $u('pdf')]))));
        $e = $this->path('event_inventory_releases', 'extra_evidence_photo_paths');
        $this->assertTrue($this->refused(fn () => $this->row('event_inventory_releases', 'extra_evidence_photo_paths', json_encode(array_fill(0, 11, $e)))));
        $this->row('event_inventory_releases', 'extra_evidence_photo_paths', json_encode(array_fill(0, 10, $e)));
    }

    public function test_files_saved_before_the_lock_are_left_alone_and_their_rows_stay_editable(): void
    {
        $this->locksOff();                                                // as it was before the lock
        $id = $this->row('inventory_items', 'photo_path', 'inventory_photos/old.webp');
        $this->locksOn();

        DB::table('inventory_items')->where('id', $id)->update(['name' => 'Renamed']);      // not touching the photo
        $this->assertSame('inventory_photos/old.webp', DB::table('inventory_items')->find($id)->photo_path);

        $this->assertTrue($this->refused(fn () => DB::table('inventory_items')->where('id', $id)->update(['photo_path' => $this->path('inventory_items', 'photo_path', 'gif')])));
        $new = $this->path('inventory_items', 'photo_path');
        DB::table('inventory_items')->where('id', $id)->update(['photo_path' => $new]);
        $this->assertSame($new, DB::table('inventory_items')->find($id)->photo_path);
    }

    public function test_the_migrations_can_run_twice(): void
    {
        $this->locksOn();
        $this->locksOn();
        $this->assertTrue($this->refused(fn () => $this->row('inventory_items', 'photo_path', 'x.gif')));
    }

    // ------------------------------------------------------------ the database: path shape

    public function test_a_path_the_app_could_never_have_written_is_refused(): void
    {
        $inventory = ['jjj.png', 'hello/jjj.png', 'photos/1731900000_Ab3xYz_jjj.png', '/etc/1731900000_Ab3xYz_jjj.png',
                      'inventory_photos/jjj.png', 'inventory_photos/1731900000_jjj.png',        // inventory needs the random part
                      'inventory_photos/173190000_Ab3xYz_jjj.png',                              // 9-digit timestamp
                      'inventory_photos/1731900000_Ab3xY_jjj.png',                              // 5 random characters
                      'inventory_photos/1731900000_Ab3xYz.png',                                 // no name part
                      'inventory_photos/1731900000_Ab3xYz_../../x.png',                         // climbing out of the folder
                      'inventory_photos/1731900000_Ab3xYz_a/b.png'];                            // a further folder
        foreach ($inventory as $bad) {
            $this->assertTrue($this->refused(fn () => $this->row('inventory_items', 'photo_path', $bad)), "accepted {$bad}");
        }
        $this->assertTrue($this->refused(fn () => $this->row('users', 'validation_id', 'validation_ids/1731900000_x/../../y.png')));

        // and the real thing, in the shapes the app writes
        $this->row('inventory_items', 'photo_path', 'inventory_photos/1731900000_Ab3xYz_my-chair_2.png');
        $this->row('users', 'validation_id', 'validation_ids/1731900000_juan_id.png');
        $this->row('users', 'validation_id', 'validation_ids/1731900000_.png');                // a file whose name was only an extension
    }

    public function test_each_column_only_takes_its_own_folder(): void
    {
        // a validation ID path in the receipt column, and so on
        $this->assertTrue($this->refused(fn () => $this->row('event_expenses', 'receipt_path', 'validation_ids/1731900000_a.png')));
        $this->assertTrue($this->refused(fn () => $this->row('users', 'validation_id', 'expense_receipts/1731900000_a.png')));
    }

    public function test_a_list_that_already_holds_an_older_file_can_still_gain_a_new_photo(): void
    {
        $this->locksOff();
        $id = $this->row('inventory_unit_logs', 'extra_photo_paths', json_encode(['inventory_unit_photos/old.webp']));
        $this->locksOn();

        $fresh = $this->path('inventory_unit_logs', 'extra_photo_paths');
        // the ledger itself never changes a saved entry, so the file-shape rule is tried with that lock lifted
        $this->withoutTimeLocks(function () use ($id, $fresh) {
            DB::table('inventory_unit_logs')->where('id', $id)->update(['extra_photo_paths' => json_encode(['inventory_unit_photos/old.webp', $fresh])]);
            $this->assertSame(['inventory_unit_photos/old.webp', $fresh], json_decode(DB::table('inventory_unit_logs')->find($id)->extra_photo_paths, true));

            // but a new element has to be a proper one
            $this->assertTrue($this->refused(fn () => DB::table('inventory_unit_logs')->where('id', $id)->update(
                ['extra_photo_paths' => json_encode(['inventory_unit_photos/old.webp', 'inventory_unit_photos/new.png'])]
            )));
        });
    }

    public function test_rolling_the_shape_rule_back_leaves_the_file_type_rule(): void
    {
        (require database_path('migrations/2026_11_19_000005_lock_upload_path_shape.php'))->down();

        $this->row('inventory_items', 'photo_path', 'anything/jjj.png');                       // shape no longer checked
        $this->assertTrue($this->refused(fn () => $this->row('inventory_items', 'photo_path', 'anything/jjj.gif')));
    }

    // ------------------------------------------------------------ the app

    private function residentPayload(array $extra = []): array
    {
        static $n = 0;
        $n++;
        return array_merge([
            'first_name' => 'Ana' . $n, 'last_name' => 'Reyes' . $n, 'contact_number' => '09171230' . str_pad((string) $n, 3, '0', STR_PAD_LEFT),
            'role' => 'Resident', 'has_account' => false,
        ], $extra);
    }

    public function test_a_validation_id_must_be_a_jpg_or_png(): void
    {
        Storage::fake('public');
        $staff = $this->staff();

        $gif = UploadedFile::fake()->createWithContent('id.gif', base64_decode(self::GIF));
        $this->actingAs($staff)->post('/users', $this->residentPayload(['validation_id' => $gif]), ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('validation_id');

        $pdf = UploadedFile::fake()->create('id.pdf', 20, 'application/pdf');
        $this->actingAs($staff)->post('/users', $this->residentPayload(['validation_id' => $pdf]), ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('validation_id');

        $png = UploadedFile::fake()->createWithContent('id.png', base64_decode(self::PNG));
        $this->actingAs($staff)->post('/users', $this->residentPayload(['validation_id' => $png]), ['Accept' => 'application/json'])->assertStatus(201);
        $this->assertStringEndsWith('.png', DB::table('users')->orderByDesc('id')->value('validation_id'));
    }

    public function test_a_file_is_judged_by_its_content_and_its_name_together(): void
    {
        Storage::fake('public');
        $staff = $this->staff();
        $post = fn (UploadedFile $f) => $this->actingAs($staff)->post('/users', $this->residentPayload(['validation_id' => $f]), ['Accept' => 'application/json']);

        $post($this->realFile('shell.php', self::PNG))->assertStatus(422);     // a PNG called .php
        $post($this->realFile('id.png', self::GIF))->assertStatus(422);        // a GIF called .png

        $post($this->realFile('id.jpeg', self::PNG))->assertStatus(201);       // content PNG, name .jpeg: accepted, stored by its content
        $path = DB::table('users')->orderByDesc('id')->value('validation_id');
        $this->assertStringEndsWith('.png', $path);
        $this->assertStringNotContainsString('.jpeg', $path);
        Storage::disk('public')->assertExists($path);
    }

    public function test_the_extension_helper_decides_from_the_content(): void
    {
        $png = $this->realFile('x.jpeg', self::PNG);
        $this->assertSame('png', Uploads::extension($png, Uploads::IMAGE));

        $gif = $this->realFile('x.png', self::GIF);
        $this->expectException(\App\Exceptions\UserFacingException::class);
        Uploads::extension($gif, Uploads::IMAGE);
    }

    public function test_a_receipt_may_be_a_pdf_a_photo_but_not_a_gif(): void
    {
        Storage::fake('public');
        $event = Event::create([
            'name' => 'Fiesta', 'description' => 'd', 'location' => 'Hall', 'event_start' => now()->addHours(3), 'event_end' => now()->addHours(5),
            'call_time_start' => now()->subHour(), 'call_time_end' => now()->addHours(6), 'approved_budget' => 1000,
        ]);
        $staff = $this->staff();

        $pdf = UploadedFile::fake()->create('r.pdf', 20, 'application/pdf');
        $this->actingAs($staff)->post("/events/{$event->id}/expenses", ['item' => 'Food', 'amount' => 100, 'receipt' => $pdf], ['Accept' => 'application/json'])->assertSuccessful();

        $gif = UploadedFile::fake()->createWithContent('r.gif', base64_decode(self::GIF));
        $this->actingAs($staff)->post("/events/{$event->id}/expenses", ['item' => 'Rice', 'amount' => 100, 'receipt' => $gif], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('receipt');

        $this->assertSame(1, DB::table('event_expenses')->count());
    }
}

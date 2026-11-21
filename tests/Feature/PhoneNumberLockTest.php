<?php

namespace Tests\Feature;

use App\Models\Household;
use App\Models\User;
use App\Support\Phone;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * Phone numbers are locked at the database (migration 2026_11_19_000003), so a
 * malformed number cannot be saved by any route, not only by the forms.
 */
class PhoneNumberLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private int $seq = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000003_lock_phone_numbers_in_database.php');
    }

    private function insertUser(string $code, ?string $phone, array $extra = []): int
    {
        return DB::table('users')->insertGetId(array_merge([
            'user_code' => sprintf('PR-%05d', ++$this->seq), 'first_name' => 'N' . $code, 'last_name' => 'T' . $code,   // distinct names: only the phone rule can refuse these rows
            'contact_number' => $phone, 'role' => 'Resident',
        ], $extra));
    }

    // ------------------------------------------------------------ the database refuses bad numbers

    public function test_the_database_refuses_a_malformed_resident_number_even_without_the_app(): void
    {
        foreach (['0812', 'abc', '0917-123-4567', '+639171234567', '091712345678', ''] as $i => $bad) {
            try {
                $this->insertUser("PR-X{$i}", $bad);
                $this->fail("'{$bad}' should have been refused");
            } catch (QueryException $e) {
                $this->assertNotSame('', $e->getMessage());
            }
        }
        $this->assertSame(0, DB::table('users')->where('first_name', 'like', 'NPR-X%')->count());
    }

    public function test_the_database_refuses_an_edit_to_a_malformed_resident_number(): void
    {
        $u = $this->makeUser();

        $this->expectException(QueryException::class);
        DB::table('users')->where('id', $u->id)->update(['contact_number' => '12345']);
    }

    public function test_a_resident_number_cannot_be_emptied(): void
    {
        $u = $this->makeUser();

        $this->expectException(QueryException::class);
        DB::table('users')->where('id', $u->id)->update(['contact_number' => null]);
    }

    public function test_a_household_number_must_be_valid_but_may_be_empty(): void
    {
        DB::table('households')->insert(['code' => 'HH-0001', 'address' => 'P1', 'contact_number' => null]);
        DB::table('households')->insert(['code' => 'HH-0002', 'address' => 'P1', 'contact_number' => '09171234567']);
        DB::table('households')->insert(['code' => 'HH-0003', 'address' => 'P1', 'contact_number' => '639171234567']);
        $this->assertSame(3, DB::table('households')->count());

        foreach (['0812', '0917 123 4567', 'abc', '', '9171234567'] as $i => $bad) {
            try {
                DB::table('households')->insert(['code' => sprintf('HH-%04d', 100 + $i), 'address' => 'P1', 'contact_number' => $bad]);
                $this->fail("'{$bad}' should have been refused");
            } catch (QueryException) {
                // expected
            }
        }
        $this->assertSame(3, DB::table('households')->count());
    }

    public function test_the_old_household_contact_column_is_locked_too(): void
    {
        $this->insertUser('PR-OK', '09171234567', ['household_contact_number' => '09181234567']);

        $this->expectException(QueryException::class);
        $this->insertUser('PR-BAD', '09171234567', ['household_contact_number' => '1234']);
    }

    // ------------------------------------------------------------ the app stores the one canonical form

    public function test_the_app_stores_every_accepted_way_of_typing_a_number_as_09_digits(): void
    {
        $this->assertSame('09171234567', Phone::canonical('0917-123-4567'));
        $this->assertSame('09171234567', Phone::canonical('+63 917 123 4567'));
        $this->assertSame('09171234567', Phone::canonical('639171234567'));
        $this->assertNull(Phone::canonical('0812'));
        $this->assertNull(Phone::canonical('abc'));
        $this->assertNull(Phone::canonical(null));

        $u = $this->makeUser('Resident', ['contact_number' => '+63 917 555 0001']);
        $this->assertSame('09175550001', $u->contact_number);
    }

    public function test_registering_with_dashes_or_plus63_still_works_and_saves_clean_digits(): void
    {
        $staff = $this->staff();
        foreach (['0917-123-4501' => '09171234501', '+63 917 123 4502' => '09171234502'] as $typed => $stored) {
            $this->actingAs($staff)->postJson('/users', [
                'first_name' => 'Maria' . substr($stored, -2), 'last_name' => 'Santos', 'contact_number' => $typed,
                'role' => 'Resident', 'has_account' => false,
            ])->assertStatus(201);
            $this->assertDatabaseHas('users', ['contact_number' => $stored]);
        }
    }

    public function test_editing_a_resident_with_a_dashed_number_saves_clean_digits(): void
    {
        $staff = $this->staff();
        $u = $this->makeUser();

        $this->actingAs($staff)->putJson("/users/{$u->id}", ['contact_number' => '0918-765-4321'])->assertOk();

        $this->assertSame('09187654321', $u->fresh()->contact_number);
    }

    // ------------------------------------------------------------ the migration cleans, or refuses, what is already stored

    public function test_the_migration_cleans_numbers_already_in_the_database(): void
    {
        $m = $this->migration();
        $m->down();                                   // the state before the lock: dirty data can exist

        $a = $this->insertUser('PR-D1', '0917-123-4567');
        $b = $this->insertUser('PR-D2', '+63 918 123 4567');
        $c = $this->insertUser('PR-D3', '09191234567', ['household_contact_number' => '0920 123 4567']);
        $h1 = DB::table('households')->insertGetId(['code' => 'HH-0201', 'address' => 'P', 'contact_number' => '0917-111-2222']);
        $h2 = DB::table('households')->insertGetId(['code' => 'HH-0202', 'address' => 'P', 'contact_number' => '   ']);

        $m->up();

        $this->assertSame('09171234567', DB::table('users')->find($a)->contact_number);
        $this->assertSame('09181234567', DB::table('users')->find($b)->contact_number);
        $this->assertSame('09201234567', DB::table('users')->find($c)->household_contact_number);
        $this->assertSame('09171112222', DB::table('households')->find($h1)->contact_number);
        $this->assertNull(DB::table('households')->find($h2)->contact_number);

        $this->expectException(QueryException::class);  // and the lock is back on
        $this->insertUser('PR-D4', 'abc');
    }

    public function test_the_migration_stops_and_changes_nothing_when_a_number_cannot_be_repaired(): void
    {
        $m = $this->migration();
        $m->down();

        $good = $this->insertUser('PR-E1', '0917-123-4567');
        $this->insertUser('PR-E2', '0812');
        $this->insertUser('PR-E3', '');

        try {
            $m->up();
            $this->fail('The migration should have refused to run');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString("'0812'", $e->getMessage());
            $this->assertStringContainsString('nothing was changed', $e->getMessage());
        }

        $this->assertSame('0917-123-4567', DB::table('users')->find($good)->contact_number);   // untouched
    }
}

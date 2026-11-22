<?php

namespace Tests\Feature;

use App\Models\HeadStaffTransfer;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * Who may hold a role, enforced by the database (migration 2026_11_19_000016).
 */
class HeadRoleAndTransferLockTest extends TestCase
{
    use RefreshDatabase, Support;

    private int $n = 0;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000016_lock_head_roles_and_single_pending_transfer.php');
    }

    private function refused(callable $write, string $why): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString($why, $e->getMessage(), 'refused, but not by the expected rule');

            return;
        }
        $this->fail("The database accepted the change ({$why})");
    }

    private function household(): int
    {
        $this->n++;

        return DB::table('households')->insertGetId(['code' => sprintf('HH-%04d', $this->n), 'address' => "Purok {$this->n}"]);
    }

    private function person(array $extra = []): int
    {
        $this->n++;

        return DB::table('users')->insertGetId(array_merge([
            'user_code' => sprintf('PR-%04d', 500 + $this->n), 'first_name' => "N{$this->n}", 'last_name' => "T{$this->n}",
            'contact_number' => '09171234567', 'role' => 'Resident',
        ], $extra));
    }

    private function offer(int $from, int $to, string $status): int
    {
        return DB::table('head_staff_transfers')->insertGetId([
            'from_user_id' => $from, 'to_user_id' => $to, 'status' => $status, 'expires_at' => now()->addHours(24)->toDateTimeString(),
        ]);
    }

    // ---------- Head Staff is Staff ----------

    public function test_only_a_staff_account_can_be_head_staff(): void
    {
        $this->person(['role' => 'Staff', 'is_head_staff' => 1]);

        $this->refused(fn () => $this->person(['role' => 'Resident', 'is_head_staff' => 1]), 'Only a Staff account can be the Head Staff');

        $resident = $this->person();
        $this->refused(fn () => DB::table('users')->where('id', $resident)->update(['is_head_staff' => 1]), 'Only a Staff account can be the Head Staff');

        $head = DB::table('users')->where('is_head_staff', 1)->value('id');
        $this->refused(fn () => DB::table('users')->where('id', $head)->update(['role' => 'Resident']), 'Only a Staff account can be the Head Staff');
        DB::table('users')->where('id', $head)->update(['is_head_staff' => 0, 'role' => 'Resident']);   // stepping down first is fine
        $this->assertSame('Resident', DB::table('users')->where('id', $head)->value('role'));
    }

    public function test_the_head_staff_hand_over_and_demotion_still_work(): void
    {
        $from = $this->headStaff();
        $to = $this->makeUser('Staff');
        $secret = $this->enableTwoFactor($from);
        $this->actingAs($from)->postJson('/staff-accounts/transfer', ['to_user_id' => $to->id, 'password' => 'Passw0rd!Strong#1', 'otp' => $this->otp($secret)])->assertOk();

        $this->assertSame(1, DB::table('head_staff_transfers')->where('status', 'pending')->count());
        $this->assertSame(1, DB::table('users')->where('is_head_staff', 1)->count());
    }

    // ---------- household head ----------

    public function test_a_household_head_must_belong_to_a_household(): void
    {
        $hh = $this->household();
        $this->person(['household_id' => $hh, 'is_household_head' => 1]);

        $this->refused(fn () => $this->person(['is_household_head' => 1]), 'A household head must belong to a household');

        $loose = $this->person();
        $this->refused(fn () => DB::table('users')->where('id', $loose)->update(['is_household_head' => 1]), 'A household head must belong to a household');

        $head = DB::table('users')->where('is_household_head', 1)->value('id');
        $this->refused(fn () => DB::table('users')->where('id', $head)->update(['household_id' => null]), 'A household head must belong to a household');
        DB::table('users')->where('id', $head)->update(['household_id' => null, 'is_household_head' => 0]);   // both together is the normal removal
        $this->assertNull(DB::table('users')->where('id', $head)->value('household_id'));
    }

    public function test_a_head_of_an_older_household_code_group_is_still_allowed(): void
    {
        // the SMS grouping still reads household_code for residents without a household row
        $this->person(['household_code' => 'LEGACY-01', 'is_household_head' => 1]);
        $this->assertSame(1, DB::table('users')->where('household_code', 'LEGACY-01')->where('is_household_head', 1)->count());

        $this->refused(fn () => $this->person(['household_code' => '', 'is_household_head' => 1]), 'A household head must belong to a household');
    }

    public function test_a_head_cannot_be_moved_to_another_household_and_stay_head(): void
    {
        $cruz = $this->household();
        $lopez = $this->household();
        $ben = $this->person(['household_id' => $cruz, 'is_household_head' => 1]);

        $this->refused(fn () => DB::table('users')->where('id', $ben)->update(['household_id' => $lopez]), 'must stop being head in the same change');
        $this->assertSame($cruz, (int) DB::table('users')->where('id', $ben)->value('household_id'));

        DB::table('users')->where('id', $ben)->update(['household_id' => $lopez, 'is_household_head' => 0]);   // what the app does
        $this->assertSame($lopez, (int) DB::table('users')->where('id', $ben)->value('household_id'));

        // an ordinary member moves freely
        $member = $this->person(['household_id' => $cruz]);
        DB::table('users')->where('id', $member)->update(['household_id' => $lopez]);
        $this->assertSame($lopez, (int) DB::table('users')->where('id', $member)->value('household_id'));
    }

    public function test_the_household_screens_still_work_with_these_rules(): void
    {
        $staff = $this->staff();
        $a = $this->makeUser('Resident');
        $b = $this->makeUser('Resident');

        $id = $this->actingAs($staff)->postJson('/households', [
            'address' => 'Purok 3', 'contact_number' => '09171230099', 'member_ids' => [$a->id, $b->id], 'head_user_id' => $a->id,
        ])->assertStatus(201)->json('id');

        $this->assertTrue((bool) $a->fresh()->is_household_head);
        $this->actingAs($staff)->deleteJson("/households/{$id}/members/{$a->id}")->assertOk();   // removing the head clears both fields together
        $this->assertNull($a->fresh()->household_id);
        $this->assertFalse((bool) $a->fresh()->is_household_head);
    }

    // ---------- one pending transfer ----------

    public function test_only_one_transfer_can_be_pending_but_closed_ones_pile_up_freely(): void
    {
        $from = $this->person(['role' => 'Staff', 'is_head_staff' => 1]);
        $to = $this->person(['role' => 'Staff']);

        $this->offer($from, $to, 'pending');
        $this->refused(fn () => $this->offer($from, $to, 'pending'), 'head_staff_transfers');   // names the table or the index

        foreach (['accepted', 'cancelled', 'expired', 'cancelled'] as $status) {
            $this->offer($from, $to, $status);
        }
        $this->assertSame(5, DB::table('head_staff_transfers')->count());

        $pending = DB::table('head_staff_transfers')->where('status', 'pending')->value('id');
        DB::table('head_staff_transfers')->where('id', $pending)->update(['status' => 'cancelled']);   // closing it frees the slot
        $this->offer($from, $to, 'pending');
        $this->assertSame(1, DB::table('head_staff_transfers')->where('status', 'pending')->count());
    }

    public function test_two_offers_at_the_same_moment_give_one_offer_and_a_plain_message(): void
    {
        $from = $this->headStaff();
        $to = $this->makeUser('Staff');
        $secret = $this->enableTwoFactor($from);

        // the other request creates its offer in the gap between this one's cancel step and its own create
        HeadStaffTransfer::creating(function () use ($from, $to) {
            static $once = true;
            if ($once) {
                $once = false;
                DB::table('head_staff_transfers')->insert([
                    'from_user_id' => $from->id, 'to_user_id' => $to->id, 'status' => 'pending', 'expires_at' => now()->addHours(24)->toDateTimeString(),
                ]);
            }
        });

        $this->actingAs($from)->postJson('/staff-accounts/transfer', ['to_user_id' => $to->id, 'password' => 'Passw0rd!Strong#1', 'otp' => $this->otp($secret)])
            ->assertStatus(409)->assertJson(['message' => 'A transfer is already waiting.']);

        $this->assertSame(1, DB::table('head_staff_transfers')->where('status', 'pending')->count());
    }

    // ---------- the migration itself ----------

    public function test_the_migration_stops_and_changes_nothing_when_two_transfers_are_already_pending(): void
    {
        $m = $this->migration();
        $m->down();
        $from = $this->person(['role' => 'Staff', 'is_head_staff' => 1]);
        $to = $this->person(['role' => 'Staff']);
        $first = $this->offer($from, $to, 'pending');
        $second = $this->offer($from, $to, 'pending');

        try {
            $m->up();
            $this->fail('The migration should have stopped.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString("#{$first}, #{$second}", $e->getMessage());
        }

        $this->offer($from, $to, 'pending');   // nothing was locked, so a third is still accepted
        $this->person(['role' => 'Resident', 'is_household_head' => 1]);   // and the user rules are not in place either
    }

    public function test_stored_users_never_block_the_migration_or_an_unrelated_edit(): void
    {
        $m = $this->migration();
        $m->down();
        $odd = $this->person(['role' => 'Resident', 'is_head_staff' => 1, 'is_household_head' => 1]);   // bad data from before the rules
        $m->up();

        DB::table('users')->where('id', $odd)->update(['first_name' => 'Edited']);   // other columns are free
        $this->assertSame('Edited', DB::table('users')->where('id', $odd)->value('first_name'));
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->down();
        $this->person(['role' => 'Resident', 'is_head_staff' => 1]);   // allowed while unlocked
        DB::table('users')->delete();
        $m->up();
        $m->down();
        $m->up();

        $this->refused(fn () => $this->person(['role' => 'Resident', 'is_head_staff' => 1]), 'Only a Staff account can be the Head Staff');
    }
}

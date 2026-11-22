<?php

namespace Tests\Feature;

use App\Models\Household;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support;
use Tests\TestCase;

/**
 * Household edits, removals and deletes keep the numbers, the heads and the members
 * intact, even with a stale screen or a failure half way.
 */
class HouseholdIntegrityTest extends TestCase
{
    use RefreshDatabase, Support;

    /** A household with a head and $others more members. */
    private function household(int $others = 1, string $phone = '09171234567'): array
    {
        $hh = Household::create(['code' => 'HH-0001', 'address' => 'Purok 1', 'contact_number' => $phone]);
        $head = $this->makeUser('Resident', ['household_id' => $hh->id, 'is_household_head' => true, 'contact_number' => $phone, 'address' => 'Purok 1']);
        $members = [];
        for ($i = 0; $i < $others; $i++) {
            $members[] = $this->makeUser('Resident', ['household_id' => $hh->id]);
        }

        return [$hh, $head, $members];
    }

    // ---------------------------------------------------------------- 1. editing never wipes a number

    public function test_an_edit_that_leaves_the_number_out_keeps_it_everywhere(): void
    {
        [$hh, $head] = $this->household();

        $this->actingAs($this->staff())->putJson("/households/{$hh->id}", ['address' => 'Purok 2'])->assertOk();

        $this->assertSame('09171234567', $hh->fresh()->contact_number);
        $this->assertSame('09171234567', $head->fresh()->contact_number);
        $this->assertSame('Purok 2', $head->fresh()->address, 'a new address still reaches the head');
    }

    public function test_clearing_the_household_number_does_not_wipe_the_heads_own_number(): void
    {
        [$hh, $head] = $this->household();

        $this->actingAs($this->staff())->putJson("/households/{$hh->id}", ['address' => 'Purok 1', 'contact_number' => ''])->assertOk();

        $this->assertNull($hh->fresh()->contact_number);
        $this->assertSame('09171234567', $head->fresh()->contact_number, 'the head keeps a number, so SMS still has somewhere to go');
    }

    public function test_a_new_number_is_stored_as_digits_and_reaches_the_head(): void
    {
        [$hh, $head] = $this->household();

        $this->actingAs($this->staff())->putJson("/households/{$hh->id}", ['address' => 'Purok 1', 'contact_number' => '0998-765-4321'])->assertOk();

        $this->assertSame('09987654321', $hh->fresh()->contact_number);
        $this->assertSame('09987654321', $head->fresh()->contact_number);
    }

    // ---------------------------------------------------------------- 3. numbers are checked

    public function test_a_malformed_household_number_is_refused_and_nothing_changes(): void
    {
        [$hh, $head] = $this->household();
        $staff = $this->staff();

        foreach (['0917-123-45', '09171234567 / 09981234567', 'abc', '12345678901'] as $bad) {
            $this->actingAs($staff)->putJson("/households/{$hh->id}", ['address' => 'Purok 9', 'contact_number' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('contact_number');
        }
        $this->assertSame('Purok 1', $hh->fresh()->address);
        $this->assertSame('09171234567', $head->fresh()->contact_number);
    }

    public function test_a_new_household_checks_the_number_too(): void
    {
        $head = $this->makeUser('Resident');

        $this->actingAs($this->staff())->postJson('/households', ['address' => 'Purok 3', 'contact_number' => '0917-123-45', 'head_user_id' => $head->id])
            ->assertStatus(422)->assertJsonValidationErrors('contact_number');
        $this->assertSame(0, Household::count());

        $this->actingAs($this->staff())->postJson('/households', ['address' => 'Purok 3', 'contact_number' => '+63 917 123 4567', 'head_user_id' => $head->id])->assertStatus(201);
        $this->assertSame('639171234567', Household::first()->contact_number);
    }

    // ---------------------------------------------------------------- 4. delete and restore

    public function test_restoring_a_deleted_household_brings_its_members_and_head_back(): void
    {
        [$hh, $head, $members] = $this->household(4);
        $staff = $this->staff();

        $this->actingAs($staff)->deleteJson("/households/{$hh->id}")->assertOk();
        $this->assertNull($head->fresh()->household_id);
        $this->assertNull($members[0]->fresh()->household_id);

        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'household', 'id' => $hh->id])
            ->assertOk()->assertJson(['relinked' => 5, 'not_relinked' => 0]);

        $this->assertSame(5, User::where('household_id', $hh->id)->count());
        $this->assertTrue((bool) $head->fresh()->is_household_head);
        $this->assertSame(1, User::where('household_id', $hh->id)->where('is_household_head', true)->count());
    }

    public function test_restore_leaves_alone_anyone_who_joined_another_household_meanwhile(): void
    {
        [$hh, $head, $members] = $this->household(2);
        $staff = $this->staff();

        $this->actingAs($staff)->deleteJson("/households/{$hh->id}")->assertOk();

        $other = Household::create(['code' => 'HH-0002', 'address' => 'Purok 2']);
        $this->actingAs($staff)->postJson("/households/{$other->id}/members", ['user_id' => $members[0]->id])->assertOk();

        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'household', 'id' => $hh->id])
            ->assertOk()->assertJson(['relinked' => 2, 'not_relinked' => 1]);

        $this->assertSame($other->id, $members[0]->fresh()->household_id, 'not pulled out of the household that took them');
        $this->assertSame($hh->id, $head->fresh()->household_id);
    }

    public function test_deleting_a_household_is_all_or_nothing(): void
    {
        [$hh, $head, $members] = $this->household(2);

        // Archiving fails after the members were unlinked.
        Household::deleting(function () { throw new \RuntimeException('disk full'); });
        try {
            $this->actingAs($this->staff())->deleteJson("/households/{$hh->id}");
        } catch (\Throwable) {
            // the failure is the point of the test
        } finally {
            Household::flushEventListeners();
        }

        $this->assertSame(3, User::where('household_id', $hh->id)->count(), 'nobody was left unlinked');
        $this->assertTrue((bool) $head->fresh()->is_household_head);
        $this->assertNotNull(Household::find($hh->id));
    }

    // ---------------------------------------------------------------- 8. a stale screen

    public function test_making_someone_head_after_they_were_removed_is_refused_with_their_name(): void
    {
        [$hh, $head, $members] = $this->household(1);
        $juan = $members[0];
        $juan->forceFill(['first_name' => 'Juan', 'last_name' => 'Dela Cruz'])->save();
        $staff = $this->staff();

        $this->actingAs($staff)->deleteJson("/households/{$hh->id}/members/{$juan->id}")->assertOk();

        $res = $this->actingAs($staff)->putJson("/households/{$hh->id}/head", ['user_id' => $juan->id])->assertStatus(422);
        $this->assertSame('Juan Dela Cruz is no longer in this household. Please refresh and try again.', $res->json('message'));

        $this->assertNull($juan->fresh()->household_id);
        $this->assertFalse((bool) $juan->fresh()->is_household_head, 'no head flag is left on someone who is not a member');
        $this->assertTrue((bool) $head->fresh()->is_household_head, 'the real head is untouched');
    }

    public function test_removing_the_same_person_twice_says_so_instead_of_failing(): void
    {
        [$hh, $head, $members] = $this->household(1);
        $staff = $this->staff();

        $this->actingAs($staff)->deleteJson("/households/{$hh->id}/members/{$members[0]->id}")->assertOk();
        $this->actingAs($staff)->deleteJson("/households/{$hh->id}/members/{$members[0]->id}")
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'is no longer in this household'));
    }

    public function test_removing_the_head_is_still_logged_and_the_rest_stay(): void
    {
        [$hh, $head, $members] = $this->household(2);

        $this->actingAs($this->staff())->deleteJson("/households/{$hh->id}/members/{$head->id}")->assertOk();

        $this->assertNull($head->fresh()->household_id);
        $this->assertFalse((bool) $head->fresh()->is_household_head);
        $this->assertSame(2, User::where('household_id', $hh->id)->count());
        $this->assertDatabaseHas('activity_logs', ['action' => 'Warning']);
    }

    public function test_the_not_a_member_message_is_translated(): void
    {
        [$hh, $head, $members] = $this->household(1);
        $staff = $this->staff();
        $this->actingAs($staff)->deleteJson("/households/{$hh->id}/members/{$members[0]->id}")->assertOk();

        $tl = $this->actingAs($staff)->withCredentials()->withUnencryptedCookie('piao_lang', 'tl')
            ->putJson("/households/{$hh->id}/head", ['user_id' => $members[0]->id]);
        $this->assertStringContainsString('wala na sa sambahayang ito', $tl->json('message'));

        $ceb = $this->actingAs($staff)->withCredentials()->withUnencryptedCookie('piao_lang', 'ceb')
            ->putJson("/households/{$hh->id}/head", ['user_id' => $members[0]->id]);
        $this->assertStringContainsString('Wala na si', $ceb->json('message'));
    }

    public function test_the_head_swap_still_works(): void
    {
        [$hh, $head, $members] = $this->household(1);

        $this->actingAs($this->staff())->putJson("/households/{$hh->id}/head", ['user_id' => $members[0]->id])->assertOk();

        $this->assertFalse((bool) $head->fresh()->is_household_head);
        $this->assertTrue((bool) $members[0]->fresh()->is_household_head);
    }
}

<?php

namespace Tests\Feature;

use App\Models\AgeBracket;
use App\Models\Membership;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Support;
use Tests\TestCase;

/** A membership can be open to several age brackets; none picked = any age. */
class MembershipAgeBracketTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        AgeBracket::forgetCache();
    }

    private function bracket(string $label): AgeBracket
    {
        return AgeBracket::where('label', $label)->firstOrFail();
    }

    private function resident(int $age): \App\Models\User
    {
        return $this->makeUser('Resident', ['birth_date' => now()->subYears($age)->subDays(3)->toDateString()]);
    }

    public function test_staff_can_create_a_program_for_two_brackets_and_it_is_returned(): void
    {
        $s = $this->staff();
        $youth = $this->bracket('Youth');
        $adult = $this->bracket('Adult');

        $res = $this->actingAs($s)->postJson('/api/memberships', [
            'name' => 'Livelihood',
            'eligible_age_bracket_ids' => [$youth->id, $adult->id],
        ])->assertStatus(201);

        $this->assertEqualsCanonicalizing([$youth->id, $adult->id], Membership::find($res->json('id'))->eligibleAgeBracketIds());

        $list = $this->actingAs($s)->getJson('/api/memberships')->assertOk()->json();
        $this->assertCount(2, $list[0]['eligible_age_brackets']);
    }

    public function test_nothing_picked_means_any_age_and_update_replaces_the_set(): void
    {
        $s = $this->staff();
        $m = Membership::create(['name' => 'Open', 'description' => 'x']);
        $this->assertSame([], $m->eligibleAgeBracketIds());

        $this->actingAs($s)->putJson("/api/memberships/{$m->id}", [
            'name' => 'Open', 'eligible_age_bracket_ids' => [$this->bracket('Senior Citizen')->id],
        ])->assertOk();
        $this->assertCount(1, $m->fresh()->eligibleAgeBracketIds());

        $this->actingAs($s)->putJson("/api/memberships/{$m->id}", ['name' => 'Open', 'eligible_age_bracket_ids' => []])->assertOk();
        $this->assertSame([], $m->fresh()->eligibleAgeBracketIds());
    }

    public function test_invalid_bracket_id_is_rejected(): void
    {
        $this->actingAs($this->staff())->postJson('/api/memberships', [
            'name' => 'Bad', 'eligible_age_bracket_ids' => [999999],
        ])->assertStatus(422);
    }

    public function test_assigning_a_resident_checks_against_any_selected_bracket(): void
    {
        $s = $this->staff();
        $m = Membership::create(['name' => 'Youth & Adult', 'description' => 'x']);
        $m->eligibleAgeBrackets()->sync([$this->bracket('Youth')->id, $this->bracket('Adult')->id]);

        $ok = $this->resident(25);
        $this->actingAs($s)->putJson("/users/{$ok->id}", [
            'first_name' => $ok->first_name, 'last_name' => $ok->last_name,
            'membership_ids' => [$m->id],
        ]);
        // a senior must be refused with a message naming both allowed groups
        $senior = $this->resident(70);
        $res = $this->actingAs($s)->putJson("/users/{$senior->id}", [
            'first_name' => $senior->first_name, 'last_name' => $senior->last_name,
            'membership_ids' => [$m->id],
        ]);
        $this->assertContains($res->getStatusCode(), [403, 422]);
        $this->assertStringContainsString('Youth or Adult', $res->getContent());
    }

    public function test_preview_counts_residents_in_any_selected_bracket(): void
    {
        $s = $this->staff();
        $this->resident(15); $this->resident(30); $this->resident(70);

        $res = $this->actingAs($s)->postJson('/memberships/eligibility-preview', [
            'eligible_age_bracket_ids' => [$this->bracket('Youth')->id, $this->bracket('Adult')->id],
        ])->assertOk();
        $this->assertSame(2, $res->json('qualify'));

        $all = $this->actingAs($s)->postJson('/memberships/eligibility-preview', [])->assertOk();
        $this->assertSame(3, $all->json('qualify'));
    }

    public function test_preview_is_staff_only(): void
    {
        $this->actingAs($this->makeUser('Resident'))->postJson('/memberships/eligibility-preview', [])->assertStatus(403);
    }

    public function test_ineligible_members_uses_the_whole_set(): void
    {
        $s = $this->staff();
        $m = Membership::create(['name' => 'Youth & Adult', 'description' => 'x']);
        $m->eligibleAgeBrackets()->sync([$this->bracket('Youth')->id, $this->bracket('Adult')->id]);
        $adult = $this->resident(30); $senior = $this->resident(70);
        $m->users()->attach([$adult->id, $senior->id]);

        $res = $this->actingAs($s)->getJson("/memberships/{$m->id}/ineligible-members")->assertOk();
        $this->assertCount(1, $res->json('ineligible'));
    }

    public function test_existing_single_values_survive_the_migration_shape(): void
    {
        $m = Membership::create(['name' => 'Seniors', 'description' => 'x']);
        $m->eligibleAgeBrackets()->sync([$this->bracket('Senior Citizen')->id]);
        $this->assertTrue($this->bracket('Senior Citizen')->memberships()->exists());
        $this->assertFalse($this->bracket('Child')->memberships()->exists());
    }
}

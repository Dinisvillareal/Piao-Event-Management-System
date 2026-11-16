<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventExpense;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * An expense must be a real amount: more than PHP 0, at most PHP 99,999,999.99
 * (what the money column holds) and at most two decimal places. A bad amount
 * must get a clear 422 message, never a server error, and nothing is saved.
 */
class ExpenseAmountLimitsTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
    }

    private function event(array $extra = []): Event
    {
        return Event::create(array_merge([
            'name' => 'Assembly', 'description' => 'Test', 'location' => 'Barangay Hall',
            'event_start' => now()->addHours(3), 'event_end' => now()->addHours(5),
            'call_time_start' => now()->subHour(), 'call_time_end' => now()->addHours(6),
        ], $extra));
    }

    private function add(Event $e, $amount)
    {
        return $this->actingAs($this->staff())->post("/events/{$e->id}/expenses", [
            'item' => 'Sound system', 'amount' => $amount, 'receipt' => UploadedFile::fake()->image('r.jpg'),
        ], ['Accept' => 'application/json']);
    }

    public function test_a_typo_with_too_many_zeros_is_refused_with_a_message_and_saves_nothing(): void
    {
        $e = $this->event();

        $this->add($e, '15000000000')->assertStatus(422)->assertJsonValidationErrors('amount');

        $this->assertSame(0, EventExpense::count());
    }

    public function test_the_largest_allowed_amount_is_accepted_and_one_cent_more_is_not(): void
    {
        $e = $this->event();

        $this->add($e, '99999999.99')->assertStatus(201);
        $this->add($e, '100000000')->assertStatus(422);

        $this->assertSame(1, EventExpense::count());
    }

    public function test_a_zero_peso_expense_is_refused(): void
    {
        $e = $this->event();

        $this->add($e, '0')->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->add($e, '0.00')->assertStatus(422);
        $this->add($e, '-5')->assertStatus(422);

        $this->assertSame(0, EventExpense::count());
    }

    public function test_an_amount_that_would_round_down_to_zero_is_refused(): void
    {
        $e = $this->event();

        $this->add($e, '0.004')->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->add($e, '12.345')->assertStatus(422);

        $this->assertSame(0, EventExpense::count());
    }

    public function test_one_centavo_and_normal_amounts_are_accepted(): void
    {
        $e = $this->event();

        $this->add($e, '0.01')->assertStatus(201);
        $this->add($e, '15000')->assertStatus(201);
        $this->add($e, '249.50')->assertStatus(201);

        $this->assertEquals(15249.51, round((float) EventExpense::sum('amount'), 2));
    }

    public function test_editing_an_expense_cannot_set_it_to_zero_or_too_large(): void
    {
        $e = $this->event();
        $id = $this->add($e, '400')->assertStatus(201)->json('expense.id');
        $staff = $this->staff();

        foreach (['0', '15000000000', '1.999'] as $bad) {
            $this->actingAs($staff)->putJson("/events/{$e->id}/expenses/{$id}", ['item' => 'Changed', 'amount' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('amount');
        }
        $this->assertEquals(400, EventExpense::find($id)->amount);

        $this->actingAs($staff)->putJson("/events/{$e->id}/expenses/{$id}", ['item' => 'Changed', 'amount' => 450.75])->assertOk();
        $this->assertEquals(450.75, EventExpense::find($id)->amount);
    }

    public function test_approved_budget_has_the_same_ceiling_everywhere(): void
    {
        $staff = $this->staff();
        $e = $this->event();

        $this->actingAs($staff)->putJson("/events/{$e->id}/budget", ['approved_budget' => '15000000000'])->assertStatus(422);
        $this->actingAs($staff)->putJson("/events/{$e->id}/budget", ['approved_budget' => '1000.456'])->assertStatus(422);
        $this->actingAs($staff)->putJson("/events/{$e->id}/budget", ['approved_budget' => '99999999.99'])->assertOk();
        $this->assertEquals(99999999.99, $e->fresh()->approved_budget);

        // A budget of exactly 0 stays allowed (it means "no money set aside").
        $this->actingAs($staff)->putJson("/events/{$e->id}/budget", ['approved_budget' => '0'])->assertOk();
    }

    public function test_the_error_message_is_clear_in_each_language(): void
    {
        $e = $this->event();
        $seen = [];

        foreach (['en', 'tl', 'ceb'] as $lang) {
            $msg = (string) $this->actingAs($this->staff())
                ->withHeader('X-Lang', $lang)
                ->post("/events/{$e->id}/expenses", [
                    'item' => 'x', 'amount' => '0', 'receipt' => UploadedFile::fake()->image('r.jpg'),
                ], ['Accept' => 'application/json'])
                ->assertStatus(422)->json('errors.amount.0');

            $this->assertNotSame('', $msg);
            $this->assertStringNotContainsString('validation.', $msg, "raw message key shown for $lang");
            $seen[$lang] = $msg;
        }

        $this->assertCount(3, array_unique($seen), 'each language should have its own wording');
    }
}

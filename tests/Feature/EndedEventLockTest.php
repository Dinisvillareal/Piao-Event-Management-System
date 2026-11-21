<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Once an event has ended, the database refuses to change its expenses, its budget, its
 * schedule, or to delete it (migration 2026_11_19_000013). Archiving it stays allowed.
 */
class EndedEventLockTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private const MONEY = 'The expenses and budget of an event that has ended cannot be changed';
    private const SCHEDULE = 'The schedule of an event that has ended cannot be changed';
    private const DELETE = 'An event that has ended cannot be permanently deleted';

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000013_lock_ended_event_budget_schedule_and_delete.php');
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

    /** An event that ended 5 days ago ($ended = true) or ends in 5 days; extra columns can override. */
    private function event(bool $ended, array $extra = []): int
    {
        $day = $ended ? now()->subDays(5) : now()->addDays(5);

        return DB::table('events')->insertGetId(array_merge([
            'name' => 'Fiesta ' . ++$this->n, 'description' => 'x', 'location' => 'Hall ' . $this->n,
            'event_start' => $day->copy()->setTime(8, 0)->toDateTimeString(),
            'event_end' => $day->copy()->setTime(10, 0)->toDateTimeString(),
            'approved_budget' => 1000,
        ], $extra));
    }

    /** An expense recorded while the event was open, then the event ends (the real order of things). */
    private function endedEventWithExpense(): array
    {
        $event = $this->event(false);
        $expense = $this->expense($event);
        $this->end($event);

        return [$event, $expense];
    }

    private function end(int $event): void
    {
        $day = now()->subDays(5);
        DB::table('events')->where('id', $event)->update([
            'event_start' => $day->copy()->setTime(8, 0)->toDateTimeString(),
            'event_end' => $day->copy()->setTime(10, 0)->toDateTimeString(),
        ]);
    }

    private function expense(int $event, float $amount = 250): int
    {
        return DB::table('event_expenses')->insertGetId(['event_id' => $event, 'item' => 'Food ' . ++$this->n, 'amount' => $amount]);
    }

    // ---------- expenses ----------

    public function test_expenses_can_be_added_changed_archived_restored_and_deleted_while_the_event_is_open(): void
    {
        $event = $this->event(false);
        $expense = $this->expense($event);
        $row = fn () => DB::table('event_expenses')->where('id', $expense);

        $row()->update(['amount' => 300]);
        $row()->update(['deleted_at' => now(), 'deleted_by' => 'PR-0001']);
        $row()->update(['deleted_at' => null, 'deleted_by' => null]);
        $row()->delete();

        $this->assertSame(0, DB::table('event_expenses')->count());
    }

    public function test_an_expense_cannot_be_added_to_an_ended_event(): void
    {
        $event = $this->event(true);

        $this->refused(fn () => $this->expense($event), self::MONEY);
        $this->assertSame(0, DB::table('event_expenses')->count());
    }

    public function test_an_expense_of_an_ended_event_cannot_be_changed_archived_restored_or_deleted(): void
    {
        [, $expense] = $this->endedEventWithExpense();
        $row = fn () => DB::table('event_expenses')->where('id', $expense);

        $this->refused(fn () => $row()->update(['amount' => 1]), self::MONEY);
        $this->refused(fn () => $row()->update(['item' => 'Renamed']), self::MONEY);
        $this->refused(fn () => $row()->update(['deleted_at' => now(), 'deleted_by' => 'PR-0001']), self::MONEY);
        $this->refused(fn () => $row()->delete(), self::MONEY);

        $this->assertEquals(250, $row()->value('amount'));
        $this->assertNull($row()->value('deleted_at'));
    }

    public function test_an_archived_expense_of_an_ended_event_cannot_be_restored(): void
    {
        $event = $this->event(false);
        $expense = $this->expense($event);
        DB::table('event_expenses')->where('id', $expense)->update(['deleted_at' => now(), 'deleted_by' => 'PR-0001']);
        $this->end($event);

        $this->refused(fn () => DB::table('event_expenses')->where('id', $expense)->update(['deleted_at' => null, 'deleted_by' => null]), self::MONEY);
    }

    public function test_an_expense_cannot_be_moved_to_or_from_an_ended_event(): void
    {
        [$ended, $expense] = $this->endedEventWithExpense();
        $open = $this->event(false);
        $openExpense = $this->expense($open);

        $this->refused(fn () => DB::table('event_expenses')->where('id', $expense)->update(['event_id' => $open]), self::MONEY);   // out of an ended event
        $this->refused(fn () => DB::table('event_expenses')->where('id', $openExpense)->update(['event_id' => $ended]), self::MONEY);   // into one
        $this->assertSame($open, (int) DB::table('event_expenses')->where('id', $openExpense)->value('event_id'));
    }

    // ---------- budget ----------

    public function test_the_budget_of_an_ended_event_cannot_be_changed_but_an_open_one_can(): void
    {
        $open = $this->event(false);
        DB::table('events')->where('id', $open)->update(['approved_budget' => 5000]);
        $this->assertEquals(5000, DB::table('events')->where('id', $open)->value('approved_budget'));

        $ended = $this->event(true);
        $this->refused(fn () => DB::table('events')->where('id', $ended)->update(['approved_budget' => 5000]), self::MONEY);
        $this->refused(fn () => DB::table('events')->where('id', $ended)->update(['approved_budget' => null]), self::MONEY);
        $this->assertEquals(1000, DB::table('events')->where('id', $ended)->value('approved_budget'));

        // saving the same budget again (the edit form resubmits it) is not a change
        DB::table('events')->where('id', $ended)->update(['approved_budget' => 1000, 'description' => 'typo fixed']);
        $this->assertSame('typo fixed', DB::table('events')->where('id', $ended)->value('description'));
    }

    public function test_an_ended_event_with_no_budget_cannot_be_given_one(): void
    {
        $ended = $this->event(true, ['approved_budget' => null]);

        $this->refused(fn () => DB::table('events')->where('id', $ended)->update(['approved_budget' => 800]), self::MONEY);
    }

    // ---------- schedule ----------

    public function test_the_schedule_of_an_ended_event_cannot_be_changed(): void
    {
        $ended = $this->event(true, ['call_time_start' => now()->subDays(5)->setTime(7, 0)->toDateTimeString(), 'call_time_end' => now()->subDays(5)->setTime(11, 0)->toDateTimeString()]);
        $when = now()->addDays(3)->toDateTimeString();

        foreach (['event_start', 'event_end', 'call_time_start', 'call_time_end'] as $column) {
            $this->refused(fn () => DB::table('events')->where('id', $ended)->update([$column => $when]), self::SCHEDULE);
        }
        $this->refused(fn () => DB::table('events')->where('id', $ended)->update(['event_end' => null]), self::SCHEDULE);
    }

    public function test_the_text_of_an_ended_event_can_still_be_corrected(): void
    {
        $ended = $this->event(true);

        DB::table('events')->where('id', $ended)->update(['name' => 'Fiesta (corrected)', 'description' => 'new', 'location' => 'Covered Court', 'posted_to_facebook' => 1]);

        $this->assertSame('Fiesta (corrected)', DB::table('events')->where('id', $ended)->value('name'));
    }

    public function test_an_open_event_can_be_rescheduled_including_into_the_past(): void
    {
        $open = $this->event(false);
        DB::table('events')->where('id', $open)->update(['event_start' => now()->addDays(9)->toDateTimeString(), 'event_end' => now()->addDays(9)->addHours(2)->toDateTimeString()]);
        $this->end($open);   // it simply ends; judged on its state before the change

        $this->refused(fn () => DB::table('events')->where('id', $open)->update(['event_end' => now()->addDays(2)->toDateTimeString()]), self::SCHEDULE);   // but no reopening
    }

    // ---------- delete and archive ----------

    public function test_an_ended_event_cannot_be_permanently_deleted_but_can_be_archived_and_restored(): void
    {
        [$ended, $expense] = $this->endedEventWithExpense();

        $this->refused(fn () => DB::table('events')->where('id', $ended)->delete(), self::DELETE);
        $this->assertSame(1, DB::table('event_expenses')->where('id', $expense)->count());   // nothing cascaded

        DB::table('events')->where('id', $ended)->update(['deleted_at' => now(), 'deleted_by' => 'PR-0001']);
        $this->assertNotNull(DB::table('events')->where('id', $ended)->value('deleted_at'));
        DB::table('events')->where('id', $ended)->update(['deleted_at' => null, 'deleted_by' => null]);
        $this->assertNull(DB::table('events')->where('id', $ended)->value('deleted_at'));
    }

    public function test_an_open_event_can_be_permanently_deleted_with_its_expenses(): void
    {
        $open = $this->event(false);
        $this->expense($open);

        DB::table('events')->where('id', $open)->delete();

        $this->assertSame(0, DB::table('events')->count());
        $this->assertSame(0, DB::table('event_expenses')->count());
    }

    // ---------- what counts as "ended" ----------

    public function test_an_event_without_an_end_time_ends_with_its_call_time_then_with_its_start_day(): void
    {
        $day = now()->subDays(3);
        $noEnd = ['event_end' => null];

        // call time end already passed -> ended
        $callEnded = $this->event(true, $noEnd + ['event_start' => $day->toDateTimeString(), 'call_time_end' => $day->copy()->addHour()->toDateTimeString()]);
        $this->refused(fn () => $this->expense($callEnded), self::MONEY);

        // no end at all: it ends when its start day ends, so a start 3 days ago is over...
        $dayEnded = $this->event(true, $noEnd + ['event_start' => $day->toDateTimeString(), 'call_time_end' => null]);
        $this->refused(fn () => $this->expense($dayEnded), self::MONEY);

        // ...but one that starts later today is still open
        $today = $this->event(false, $noEnd + ['event_start' => now()->addMinutes(30)->toDateTimeString(), 'call_time_end' => null]);
        $this->expense($today);
        $this->assertSame(1, DB::table('event_expenses')->where('event_id', $today)->count());
    }

    public function test_an_event_that_ended_an_hour_ago_is_already_locked(): void
    {
        $event = $this->event(false, ['event_start' => now()->subHours(3)->toDateTimeString(), 'event_end' => now()->subHour()->toDateTimeString()]);

        $this->refused(fn () => $this->expense($event), self::MONEY);
    }

    public function test_an_event_that_is_still_running_is_not_locked(): void
    {
        $event = $this->event(false, ['event_start' => now()->subHour()->toDateTimeString(), 'event_end' => now()->addHour()->toDateTimeString()]);

        $this->expense($event);
        DB::table('events')->where('id', $event)->update(['approved_budget' => 2000]);

        $this->assertEquals(2000, DB::table('events')->where('id', $event)->value('approved_budget'));
    }

    // ---------- the migration itself ----------

    public function test_stored_history_never_blocks_the_migration_or_an_unrelated_edit(): void
    {
        $m = $this->migration();
        $m->down();
        $event = $this->event(true);
        $this->expense($event);   // an expense on an ended event, stored before the lock existed
        $m->up();                 // the migration does not scan, so it cannot fail on it

        DB::table('events')->where('id', $event)->update(['location' => 'New hall']);
        $this->assertSame('New hall', DB::table('events')->where('id', $event)->value('location'));
    }

    public function test_the_lock_can_be_lifted_for_seeding_and_put_back(): void
    {
        $m = $this->migration();
        $event = $this->event(true);

        $m->down();
        $this->expense($event);   // history can be written while the lock is lifted
        $m->up();
        $m->up();                 // safe to run twice

        $this->refused(fn () => $this->expense($event), self::MONEY);
        $this->assertSame(1, DB::table('event_expenses')->count());
    }
}

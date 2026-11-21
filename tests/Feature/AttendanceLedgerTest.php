<?php

namespace Tests\Feature;

use App\Models\AttendanceScan;
use App\Models\Event;
use App\Support\AttendanceLedger;
use App\Support\AuditChain;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * Attendance is protected in two layers (migrations 2026_11_19_000022 and 000023):
 *
 *   the rows of `attendances`   cannot be moved to another person or event, must keep a status that agrees with
 *                               their scans, and a row that holds a scan cannot be deleted unless the ledger
 *                               shows the scan was voided;
 *   the scan ledger             every real scan is written once to `attendance_scans`, which is add-only and on a
 *                               hash chain, and `attendance:reconcile` compares it with the rows.
 */
class AttendanceLedgerTest extends TestCase
{
    use RefreshDatabase, Support;

    private const IN = '2026-10-10 08:30:00';
    private const OUT = '2026-10-10 12:30:00';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        @unlink(AuditChain::anchorPath('attendance_scans'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        @unlink(AuditChain::anchorPath('attendance_scans'));
        parent::tearDown();
    }

    private function rowLocks(): object
    {
        return require database_path('migrations/2026_11_19_000023_lock_attendance_rows.php');
    }

    private function ledgerMigration(): object
    {
        return require database_path('migrations/2026_11_19_000022_create_attendance_scan_ledger.php');
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

    /** A finished event (so the scan times are real), with the usual windows around it. */
    private function event(): int
    {
        return DB::table('events')->insertGetId([
            'name' => 'Assembly', 'description' => 'x', 'location' => 'Hall',
            'call_time_start' => '2026-10-10 08:00:00', 'event_start' => '2026-10-10 09:00:00',
            'event_end' => '2026-10-10 12:00:00', 'call_time_end' => '2026-10-10 13:00:00',
        ]);
    }

    private function row(int $event, int $user, ?string $in = null, ?string $out = null): int
    {
        return DB::table('attendances')->insertGetId([
            'event_id' => $event, 'user_id' => $user, 'time_in' => $in, 'time_out' => $out,
            'status' => $in && $out ? 'Complete' : ($in || $out ? 'Incomplete' : 'missed'),
        ]);
    }

    /** A row together with the ledger entries that back it, as the scan screen writes them. */
    private function scanned(int $event, int $user, bool $out = false): int
    {
        $id = $this->row($event, $user, self::IN, $out ? self::OUT : null);
        AttendanceLedger::record('in', $event, $user, Carbon::parse(self::IN), 'scan', null, 'PR-0001');
        if ($out) {
            AttendanceLedger::record('out', $event, $user, Carbon::parse(self::OUT), 'scan', null, 'PR-0001');
        }

        return $id;
    }

    /** Runs a change that no screen can make, the way someone with direct database access could. */
    private function tamper(callable $change)
    {
        return $this->withoutTimeLocks($change);
    }

    private function verify(): array
    {
        $code = Artisan::call('log:verify');

        return [$code, Artisan::output()];
    }

    private function reconcile(array $options = []): array
    {
        $code = Artisan::call('attendance:reconcile', $options);

        return [$code, Artisan::output()];
    }

    // =========================================================== the attendance rows

    public function test_a_row_cannot_be_moved_to_another_person_or_event(): void
    {
        $event = $this->event();
        $other = $this->event();
        $a = $this->makeUser()->id;
        $b = $this->makeUser()->id;
        $id = $this->row($event, $a, self::IN);

        $this->refused(fn () => DB::table('attendances')->where('id', $id)->update(['user_id' => $b]), 'cannot be moved to another event or person');
        $this->refused(fn () => DB::table('attendances')->where('id', $id)->update(['event_id' => $other]), 'cannot be moved to another event or person');
        DB::table('attendances')->where('id', $id)->update(['updated_at' => now()]);   // any other edit is fine
        $this->assertSame($a, (int) DB::table('attendances')->where('id', $id)->value('user_id'));
    }

    public function test_the_status_must_agree_with_the_scans_when_a_row_is_added(): void
    {
        $event = $this->event();
        $why = 'The attendance status must match the scans';
        $add = fn (?string $in, ?string $out, string $status) => fn () => DB::table('attendances')->insert(
            ['event_id' => $event, 'user_id' => $this->makeUser()->id, 'time_in' => $in, 'time_out' => $out, 'status' => $status]
        );

        $this->refused($add(null, null, 'Complete'), $why);              // nobody scanned
        $this->refused($add(self::IN, null, 'Complete'), $why);          // one scan is not enough
        $this->refused($add(self::IN, self::OUT, 'missed'), $why);       // both scans, yet "missed"
        $this->refused($add(null, self::OUT, 'missed'), $why);
        $this->refused($add(null, null, 'Incomplete'), $why);

        $add(null, null, 'missed')();
        $add(self::IN, null, 'Incomplete')();
        $add(null, self::OUT, 'Incomplete')();
        $add(self::IN, self::OUT, 'Complete')();
        $add(self::IN, self::OUT, 'complete')();   // letter case does not matter
        $this->assertSame(5, DB::table('attendances')->count());
    }

    public function test_the_status_must_still_agree_with_the_scans_when_a_row_changes(): void
    {
        $event = $this->event();
        $id = $this->row($event, $this->makeUser()->id, self::IN);
        $why = 'The attendance status must match the scans';

        $this->refused(fn () => DB::table('attendances')->where('id', $id)->update(['status' => 'Complete']), $why);                       // a status on its own
        $this->refused(fn () => DB::table('attendances')->where('id', $id)->update(['status' => 'missed']), $why);
        $this->refused(fn () => DB::table('attendances')->where('id', $id)->update(['time_out' => self::OUT]), $why);                      // a scan without its status

        DB::table('attendances')->where('id', $id)->update(['time_out' => self::OUT, 'status' => 'Complete']);                              // both together
        $this->assertSame('Complete', DB::table('attendances')->where('id', $id)->value('status'));
    }

    public function test_an_older_row_with_a_wrong_status_does_not_block_an_unrelated_edit_and_the_migration_never_fails_on_it(): void
    {
        $m = $this->rowLocks();
        $m->down();
        $event = $this->event();
        $id = DB::table('attendances')->insertGetId(['event_id' => $event, 'user_id' => $this->makeUser()->id, 'time_in' => self::IN, 'time_out' => self::OUT, 'status' => 'missed']);
        $m->up();   // runs fine over it

        DB::table('attendances')->where('id', $id)->update(['updated_at' => now()]);
        $this->assertSame('missed', DB::table('attendances')->where('id', $id)->value('status'));
    }

    public function test_a_row_that_holds_a_scan_cannot_be_deleted_until_its_scan_is_voided(): void
    {
        $event = $this->event();
        $user = $this->makeUser()->id;
        $id = $this->scanned($event, $user);
        $why = 'An attendance row that holds a scan cannot be deleted';

        $this->refused(fn () => DB::table('attendances')->where('id', $id)->delete(), $why);
        $this->refused(fn () => DB::table('attendances')->delete(), $why);

        AttendanceLedger::void($event, $user);
        DB::table('attendances')->where('id', $id)->delete();
        $this->assertSame(0, DB::table('attendances')->count());
    }

    public function test_a_row_with_no_scan_can_still_be_deleted(): void
    {
        $event = $this->event();
        $id = $this->row($event, $this->makeUser()->id);

        DB::table('attendances')->where('id', $id)->delete();
        $this->assertSame(0, DB::table('attendances')->count());
    }

    public function test_a_void_only_frees_the_scans_before_it(): void
    {
        $event = $this->event();
        $user = $this->makeUser()->id;
        $this->scanned($event, $user);
        AttendanceLedger::void($event, $user);
        DB::table('attendances')->where('user_id', $user)->delete();

        // the person is added to the event again and scans again: the earlier void no longer frees this row
        $id = $this->row($event, $user, self::IN);
        AttendanceLedger::record('in', $event, $user, Carbon::parse(self::IN), 'scan', null, 'PR-0001');

        $this->refused(fn () => DB::table('attendances')->where('id', $id)->delete(), 'An attendance row that holds a scan cannot be deleted');
    }

    public function test_the_row_locks_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->rowLocks();
        $m->up();   // twice in a row is safe
        $m->down();

        $event = $this->event();
        $id = $this->row($event, $this->makeUser()->id, self::IN);
        DB::table('attendances')->where('id', $id)->update(['status' => 'missed']);   // allowed while unlocked
        DB::table('attendances')->where('id', $id)->delete();
        $m->up();

        $this->refused(fn () => $this->row($event, $this->makeUser()->id, self::IN) && DB::table('attendances')->insert(
            ['event_id' => $event, 'user_id' => $this->makeUser()->id, 'time_in' => self::IN, 'status' => 'Complete']
        ), 'The attendance status must match the scans');
    }

    // =========================================================== the scan ledger

    public function test_a_ledger_entry_can_be_added_and_read_but_never_edited_or_deleted(): void
    {
        $event = $this->event();
        $user = $this->makeUser()->id;
        $scan = AttendanceLedger::record('in', $event, $user, Carbon::parse(self::IN), 'scan', null, 'PR-0001');

        $this->refused(fn () => DB::table('attendance_scans')->where('id', $scan->id)->update(['scanned_at' => '2026-10-10 08:31:00']), 'The attendance scan ledger cannot be changed');
        $this->refused(fn () => DB::table('attendance_scans')->where('id', $scan->id)->update(['kind' => 'out']), 'The attendance scan ledger cannot be changed');
        $this->refused(fn () => DB::table('attendance_scans')->where('id', $scan->id)->update(['user_id' => $user + 1]), 'The attendance scan ledger cannot be changed');
        $this->refused(fn () => DB::table('attendance_scans')->where('id', $scan->id)->update(['row_hash' => str_repeat('0', 64)]), 'The attendance scan ledger cannot be changed');
        $this->refused(fn () => DB::table('attendance_scans')->where('id', $scan->id)->delete(), 'The attendance scan ledger cannot be deleted');
        $this->refused(fn () => DB::table('attendance_scans')->delete(), 'The attendance scan ledger cannot be deleted');
        $this->refused(fn () => $scan->update(['note' => 'edited through the model']), 'The attendance scan ledger cannot be changed');
        $this->refused(fn () => $scan->delete(), 'The attendance scan ledger cannot be deleted');

        $this->assertSame(self::IN, substr((string) DB::table('attendance_scans')->where('id', $scan->id)->value('scanned_at'), 0, 19));
        $this->assertSame(1, AttendanceScan::count());
    }

    public function test_an_entry_must_have_a_known_kind_and_source_and_a_time_unless_it_is_a_void(): void
    {
        $event = $this->event();
        $user = $this->makeUser()->id;
        $why = 'A scan needs a kind (in, out or void), a source, and its time';
        $add = fn (array $v) => fn () => DB::table('attendance_scans')->insert($v + [
            'event_id' => $event, 'user_id' => $user, 'kind' => 'in', 'scanned_at' => self::IN, 'source' => 'scan', 'recorded_by' => 'PR-0001',
            'created_at' => now()->toDateTimeString(),
        ]);

        $this->refused($add(['kind' => 'present']), $why);
        $this->refused($add(['source' => 'manual']), $why);
        $this->refused($add(['scanned_at' => null]), $why);                         // a scan with no time
        $this->refused($add(['kind' => 'void']), $why);                             // a void has no time of its own
        $add(['kind' => 'void', 'scanned_at' => null, 'source' => 'system'])();
        $add(['kind' => 'out', 'source' => 'offline'])();
        $this->assertSame(2, DB::table('attendance_scans')->count());
    }

    public function test_an_entry_cannot_be_dated_in_the_future(): void
    {
        $event = $this->event();
        $user = $this->makeUser()->id;
        $why = 'cannot be in the future';

        $this->refused(fn () => AttendanceLedger::record('in', $event, $user, now()->addDay()), $why);
        $this->refused(fn () => DB::table('attendance_scans')->insert([
            'event_id' => $event, 'user_id' => $user, 'kind' => 'in', 'scanned_at' => self::IN, 'source' => 'scan', 'recorded_by' => 'PR-0001',
            'created_at' => now()->addDays(2)->toDateTimeString(),
        ]), $why);
        $this->assertSame(0, AttendanceScan::count());
    }

    public function test_the_ledger_does_not_depend_on_the_people_or_events_it_records(): void
    {
        // no foreign keys: archiving or removing a person or event can never cascade into the history
        $scan = AttendanceLedger::record('in', 9999, 8888, Carbon::parse(self::IN), 'scan', null, 'PR-0001');
        $this->assertNotNull($scan->id);
    }

    public function test_the_ledger_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->ledgerMigration();
        $m->up();   // twice in a row is safe
        $m->down(false);   // lifts the locks, keeps the table

        $event = $this->event();
        $scan = AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN), 'scan', null, 'PR-0001');
        DB::table('attendance_scans')->where('id', $scan->id)->update(['note' => 'allowed while unlocked']);
        $m->up();

        $this->refused(fn () => DB::table('attendance_scans')->where('id', $scan->id)->update(['note' => 'x']), 'The attendance scan ledger cannot be changed');
        $this->assertSame(1, AttendanceScan::count());   // the history was kept
    }

    // =========================================================== the hash chain

    public function test_each_entry_follows_the_one_before_it_and_the_fingerprints_never_leave_the_server(): void
    {
        $event = $this->event();
        $a = AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN), 'scan', null, 'PR-0001');
        $b = AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN), 'offline', 'taken offline', 'PR-0001');

        $a->refresh();
        $b->refresh();
        $this->assertSame('', $a->prev_hash);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $a->row_hash);
        $this->assertSame($a->row_hash, $b->prev_hash);
        $this->assertNotSame($a->row_hash, $b->row_hash);
        $this->assertArrayNotHasKey('row_hash', $a->toArray());
        $this->assertArrayNotHasKey('prev_hash', $a->toArray());

        [$code, $out] = $this->verify();
        $this->assertSame(0, $code, $out);
        $this->assertStringContainsString('attendance scan ledger is intact', strtolower($out));
    }

    public function test_an_edited_entry_is_named(): void
    {
        $event = $this->event();
        $user = $this->makeUser()->id;
        AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN), 'scan', null, 'PR-0001');
        $b = AttendanceLedger::record('in', $event, $user, Carbon::parse(self::IN), 'scan', null, 'PR-0001');
        AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN), 'scan', null, 'PR-0001');

        $this->tamper(fn () => DB::table('attendance_scans')->where('id', $b->id)->update(['scanned_at' => '2026-10-10 08:00:01']));

        [$code, $out] = $this->verify();
        $this->assertSame(1, $code);
        $this->assertStringContainsString("Row #{$b->id} was edited", $out);
        $this->assertStringContainsString('TAMPERING DETECTED in the attendance scan ledger', $out);
        $this->assertSame(1, substr_count($out, 'Row #'));
    }

    public function test_a_removed_entry_is_noticed_at_the_entry_after_it(): void
    {
        $event = $this->event();
        AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN));
        $b = AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN));
        $c = AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN));

        $this->tamper(fn () => DB::table('attendance_scans')->where('id', $b->id)->delete());

        $this->assertStringContainsString("Row #{$c->id} does not follow the row before it", $this->verify()[1]);
    }

    public function test_an_entry_planted_by_hand_is_noticed(): void
    {
        $event = $this->event();
        AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN));
        DB::table('attendance_scans')->insert([
            'event_id' => $event, 'user_id' => $this->makeUser()->id, 'kind' => 'in', 'scanned_at' => self::IN, 'source' => 'scan',
            'recorded_by' => 'PR-0001', 'created_at' => now()->subDay()->toDateTimeString(),
        ]);
        $planted = (int) DB::table('attendance_scans')->max('id');

        $this->assertStringContainsString("Row #{$planted} has no fingerprint", $this->verify()[1]);
    }

    public function test_entries_cut_off_the_end_are_caught_with_a_checkpoint(): void
    {
        $event = $this->event();
        AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN));
        $last = AttendanceLedger::record('in', $event, $this->makeUser()->id, Carbon::parse(self::IN));
        Artisan::call('log:verify', ['--anchor' => true]);

        $this->tamper(fn () => DB::table('attendance_scans')->where('id', $last->id)->delete());

        $this->assertStringContainsString('checkpoint', strtolower($this->verify()[1]));
        $this->assertSame(1, $this->verify()[0]);
    }

    // =========================================================== the scan screens write the ledger

    private function scanSetup(): array
    {
        Carbon::setTestNow(Carbon::parse('2026-11-14 06:00:00', 'Asia/Manila'));
        $event = Event::create([
            'name' => 'Assembly', 'description' => 'Test', 'location' => 'Hall',
            'call_time_start' => '2026-11-14 07:00:00', 'event_start' => '2026-11-14 09:00:00',
            'event_end' => '2026-11-14 11:00:00', 'call_time_end' => '2026-11-14 12:00:00',
        ]);

        return [$event, $this->staff(), $this->makeUser('Resident')];
    }

    public function test_a_sign_in_and_a_sign_out_are_each_written_to_the_ledger_with_their_time_and_who_scanned(): void
    {
        [$event, $staff, $resident] = $this->scanSetup();
        $data = ['event_id' => $event->id, 'user_id' => $resident->id];

        Carbon::setTestNow(Carbon::parse('2026-11-14 08:20:00', 'Asia/Manila'));
        $this->actingAs($staff)->postJson('/attendance/time-in', $data)->assertSuccessful();
        Carbon::setTestNow(Carbon::parse('2026-11-14 11:30:00', 'Asia/Manila'));
        $this->actingAs($staff)->putJson('/attendance/time-out', $data)->assertSuccessful();

        $entries = AttendanceScan::where('event_id', $event->id)->orderBy('id')->get();
        $this->assertSame(['in', 'out'], $entries->pluck('kind')->all());
        $this->assertSame(['scan', 'scan'], $entries->pluck('source')->all());
        $this->assertSame(['2026-11-14 08:20:00', '2026-11-14 11:30:00'], $entries->map(fn ($e) => $e->scanned_at->format('Y-m-d H:i:s'))->all());
        $this->assertSame([$staff->user_code, $staff->user_code], $entries->pluck('recorded_by')->all());
        $this->assertSame(0, $this->reconcile()[0]);
        $this->assertSame(0, $this->verify()[0]);
    }

    public function test_a_scan_that_waited_for_signal_is_recorded_as_offline_with_the_time_it_was_taken(): void
    {
        [$event, $staff, $resident] = $this->scanSetup();

        Carbon::setTestNow(Carbon::parse('2026-11-14 09:30:00', 'Asia/Manila'));   // the phone only now has signal
        $this->actingAs($staff)->postJson('/attendance/time-in', ['event_id' => $event->id, 'user_id' => $resident->id, 'scanned_at' => '2026-11-14T08:55:00+08:00'])->assertSuccessful();

        $scan = AttendanceScan::where('event_id', $event->id)->first();
        $this->assertSame('offline', $scan->source);
        $this->assertSame('2026-11-14 08:55:00', $scan->scanned_at->format('Y-m-d H:i:s'));
        $this->assertSame(0, $this->reconcile()[0]);
    }

    public function test_a_sign_out_without_a_sign_in_is_written_too(): void
    {
        [$event, $staff, $resident] = $this->scanSetup();

        Carbon::setTestNow(Carbon::parse('2026-11-14 11:30:00', 'Asia/Manila'));
        $this->actingAs($staff)->putJson('/attendance/time-out', ['event_id' => $event->id, 'user_id' => $resident->id])->assertStatus(201);

        $this->assertSame(['out'], AttendanceScan::pluck('kind')->all());
        $this->assertSame(0, $this->reconcile()[0]);
    }

    public function test_a_refused_scan_leaves_nothing_in_the_ledger(): void
    {
        [$event, $staff, $resident] = $this->scanSetup();
        $data = ['event_id' => $event->id, 'user_id' => $resident->id];

        Carbon::setTestNow(Carbon::parse('2026-11-14 06:30:00', 'Asia/Manila'));   // before the window opens
        $this->actingAs($staff)->postJson('/attendance/time-in', $data)->assertStatus(403);
        Carbon::setTestNow(Carbon::parse('2026-11-14 08:00:00', 'Asia/Manila'));
        $this->actingAs($staff)->postJson('/attendance/time-in', $data)->assertSuccessful();
        $this->actingAs($staff)->postJson('/attendance/time-in', $data)->assertStatus(400);   // already signed in

        $this->assertSame(1, AttendanceScan::count());
    }

    public function test_removing_a_person_from_an_event_voids_their_scan_first_and_then_removes_the_row(): void
    {
        [$event, $staff, $resident] = $this->scanSetup();
        $event->createAttendanceRecords();

        Carbon::setTestNow(Carbon::parse('2026-11-14 08:00:00', 'Asia/Manila'));
        $this->actingAs($staff)->postJson('/attendance/time-in', ['event_id' => $event->id, 'user_id' => $resident->id])->assertSuccessful();

        $event->membership_ids = [999999];   // nobody is on this audience any more
        $event->save();
        $event->syncAttendanceRecords();

        $this->assertSame(0, DB::table('attendances')->where('event_id', $event->id)->where('user_id', $resident->id)->count());
        $last = AttendanceScan::where('event_id', $event->id)->where('user_id', $resident->id)->orderByDesc('id')->first();
        $this->assertSame('void', $last->kind);
        $this->assertSame(AttendanceLedger::VOID_NOTE, $last->note);
        $this->assertSame(['in', 'void'], AttendanceScan::where('user_id', $resident->id)->orderBy('id')->pluck('kind')->all());
        $this->assertSame(0, $this->reconcile()[0]);   // a voided scan with no row is how a removal looks
    }

    // =========================================================== reconcile

    public function test_reconcile_is_clean_when_rows_and_ledger_agree(): void
    {
        $event = $this->event();
        $this->scanned($event, $this->makeUser()->id);
        $this->scanned($event, $this->makeUser()->id, true);
        $this->row($event, $this->makeUser()->id);   // missed, no scan

        [$code, $out] = $this->reconcile();
        $this->assertSame(0, $code, $out);
        $this->assertStringContainsString('matches the scan ledger', $out);
    }

    public function test_reconcile_names_a_time_that_was_changed(): void
    {
        $event = $this->event();
        $user = $this->makeUser();
        $this->scanned($event, $user->id);
        $this->tamper(fn () => DB::table('attendances')->where('user_id', $user->id)->update(['time_in' => '2026-10-10 08:59:00']));

        [$code, $out] = $this->reconcile();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('sign-in time of 2026-10-10 08:59:00 but the ledger says 2026-10-10 08:30:00', $out);
        $this->assertStringContainsString($user->user_code, $out);
    }

    public function test_reconcile_names_a_status_that_was_changed(): void
    {
        $event = $this->event();
        $user = $this->makeUser();
        $this->scanned($event, $user->id);
        $this->tamper(fn () => DB::table('attendances')->where('user_id', $user->id)->update(['status' => 'Complete']));

        [$code, $out] = $this->reconcile();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('has the status "Complete" but its scans say incomplete', $out);
    }

    public function test_reconcile_names_a_time_that_was_erased(): void
    {
        $event = $this->event();
        $user = $this->makeUser();
        $this->scanned($event, $user->id);
        $this->tamper(fn () => DB::table('attendances')->where('user_id', $user->id)->update(['time_in' => null, 'status' => 'missed']));

        [$code, $out] = $this->reconcile();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('the time was erased', $out);
    }

    public function test_reconcile_names_a_row_removed_without_voiding_its_scan(): void
    {
        $event = $this->event();
        $user = $this->makeUser();
        $this->scanned($event, $user->id);
        $this->tamper(fn () => DB::table('attendances')->where('user_id', $user->id)->delete());

        [$code, $out] = $this->reconcile();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('no attendance row', $out);
    }

    public function test_reconcile_names_a_voided_scan_whose_row_still_holds_it(): void
    {
        $event = $this->event();
        $user = $this->makeUser();
        $this->scanned($event, $user->id);
        AttendanceLedger::void($event, $user->id);

        [$code, $out] = $this->reconcile();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('was voided in the ledger but its attendance row still holds a scan', $out);
    }

    public function test_reconcile_names_a_row_with_a_time_that_has_no_scan_behind_it_and_a_doubled_scan(): void
    {
        $event = $this->event();
        $ghost = $this->makeUser();
        $twice = $this->makeUser();
        $this->row($event, $ghost->id, self::IN);                       // never scanned
        $this->scanned($event, $twice->id);
        AttendanceLedger::record('in', $event, $twice->id, Carbon::parse(self::IN));   // a second sign-in for the same person

        [$code, $out] = $this->reconcile();
        $this->assertSame(1, $code);
        $this->assertStringContainsString('with no scan behind it in the ledger', $out);
        $this->assertStringContainsString('more than one sign-in or sign-out', $out);
    }

    public function test_adopt_writes_rows_that_pre_date_the_ledger_as_explicit_system_entries(): void
    {
        $event = $this->event();
        $a = $this->makeUser();
        $b = $this->makeUser();
        $this->row($event, $a->id, self::IN);
        $this->row($event, $b->id, self::IN, self::OUT);

        $this->assertSame(1, $this->reconcile()[0]);
        [$code, $out] = $this->reconcile(['--adopt' => true, '--force' => true]);
        $this->assertSame(0, $code, $out);
        $this->assertStringContainsString('3 opening entries written', $out);

        $entries = AttendanceScan::orderBy('id')->get();
        $this->assertSame(['in', 'in', 'out'], $entries->pluck('kind')->all());
        $this->assertSame(['system', 'system', 'system'], $entries->pluck('source')->all());
        $this->assertSame(['SYSTEM', 'SYSTEM', 'SYSTEM'], $entries->pluck('recorded_by')->all());
        $this->assertSame(0, $this->reconcile()[0]);
        $this->assertSame(0, $this->verify()[0]);
        $this->assertSame(0, AttendanceLedger::adopt());   // nothing left to adopt
    }

    public function test_adopt_never_hides_a_real_mismatch(): void
    {
        $event = $this->event();
        $user = $this->makeUser();
        $this->scanned($event, $user->id);
        $this->tamper(fn () => DB::table('attendances')->where('user_id', $user->id)->update(['time_in' => '2026-10-10 08:59:00']));

        [$code, $out] = $this->reconcile(['--adopt' => true, '--force' => true]);
        $this->assertSame(1, $code);
        $this->assertStringContainsString('every difference is a real mismatch to investigate', $out);
        $this->assertSame(1, AttendanceScan::count());   // nothing was written to make it agree
    }

    public function test_the_demo_data_seeder_writes_the_opening_entries(): void
    {
        $event = $this->event();
        $this->row($event, $this->makeUser()->id, self::IN, self::OUT);

        $this->assertSame(1, $this->reconcile()[0]);
        $this->seed(\Database\Seeders\AttendanceLedgerSeeder::class);
        $this->assertSame(0, $this->reconcile()[0]);
    }

    public function test_the_security_check_reports_an_attendance_row_that_differs_from_the_ledger(): void
    {
        $event = $this->event();
        $this->row($event, $this->makeUser()->id, self::IN);   // a scan with nothing behind it

        Artisan::call('security:check');
        $out = Artisan::output();
        $this->assertMatchesRegularExpression('/FAIL\s*\|\s*Attendance matches the scan ledger/', $out);
    }
}

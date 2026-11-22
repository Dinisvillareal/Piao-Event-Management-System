<?php

namespace Tests\Feature;

use App\Models\GeneratedReport;
use App\Support\AuditChain;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * The Report History (generated_reports) is add-only and a hash chain (migration 2026_11_19_000020):
 * a row can be added and read, never edited or deleted, and any edit, removal or planted row that gets
 * past that lock is named by `php artisan log:verify`.
 */
class ReportHistoryChainTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        @unlink(AuditChain::anchorPath('generated_reports'));
    }

    protected function tearDown(): void
    {
        @unlink(AuditChain::anchorPath('generated_reports'));
        parent::tearDown();
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000020_lock_report_history_and_hash_chain.php');
    }

    private function report(string $title = 'Membership Summary', array $extra = []): GeneratedReport
    {
        return GeneratedReport::create(array_merge([
            'user_code' => 'PR-0001', 'type' => 'membership', 'format' => 'csv', 'title' => $title, 'scope_label' => 'All time',
            'filters' => ['date_from' => '2026-10-01', 'membership_id' => 3], 'sections' => [['heading' => 'Members', 'rows' => [['Ana', 12], ['Ben', 7]]]],
        ], $extra))->fresh();
    }

    private function refused(callable $write, string $why): void
    {
        try {
            $write();
        } catch (QueryException $e) {
            $this->assertStringContainsString($why, $e->getMessage());

            return;
        }
        $this->fail("The database accepted the change ({$why})");
    }

    private function verify(): array
    {
        $code = Artisan::call('log:verify');

        return [$code, Artisan::output()];
    }

    private function tamper(callable $change): void
    {
        $this->withoutTimeLocks($change);
    }

    // ---------- add-only ----------

    public function test_a_report_row_can_be_added_and_read_but_never_edited_or_deleted(): void
    {
        $a = $this->report();

        $this->refused(fn () => DB::table('generated_reports')->where('id', $a->id)->update(['title' => 'Something else']), 'The report history cannot be changed');
        $this->refused(fn () => DB::table('generated_reports')->where('id', $a->id)->update(['sections' => '[]']), 'The report history cannot be changed');
        $this->refused(fn () => DB::table('generated_reports')->where('id', $a->id)->update(['user_code' => 'PR-0002']), 'The report history cannot be changed');
        $this->refused(fn () => DB::table('generated_reports')->where('id', $a->id)->delete(), 'The report history cannot be deleted');
        $this->refused(fn () => DB::table('generated_reports')->delete(), 'The report history cannot be deleted');
        $this->refused(fn () => $a->update(['title' => 'Edited through the model']), 'The report history cannot be changed');
        $this->refused(fn () => $a->delete(), 'The report history cannot be deleted');

        $this->assertSame('Membership Summary', DB::table('generated_reports')->where('id', $a->id)->value('title'));
        $this->report('Budget Summary', ['type' => 'budget']);
        $this->assertSame(2, GeneratedReport::count());
    }

    public function test_the_hash_columns_cannot_be_changed_either(): void
    {
        $a = $this->report();

        $this->refused(fn () => DB::table('generated_reports')->where('id', $a->id)->update(['row_hash' => str_repeat('0', 64)]), 'The report history cannot be changed');
    }

    public function test_exporting_a_report_through_the_app_still_records_it_in_the_chain(): void
    {
        $staff = $this->staff();

        $this->actingAs($staff)->get('/reports/export/csv?type=membership')->assertOk();
        $row = DB::table('generated_reports')->first();

        $this->assertNotNull($row);
        $this->assertSame(64, strlen($row->row_hash));
        $this->assertSame(0, $this->verify()[0]);

        $json = $this->actingAs($staff)->getJson('/reports/history')->assertOk()->getContent();
        $this->assertStringNotContainsString('row_hash', $json);
        $this->assertStringNotContainsString('prev_hash', $json);
    }

    // ---------- the chain ----------

    public function test_each_row_follows_the_one_before_it_and_the_two_chains_are_separate(): void
    {
        $a = $this->report('One');
        $b = $this->report('Two');
        $c = $this->report('Three');
        (new \App\Models\ActivityLog())->forceFill(['user_code' => 'PR-0001', 'action' => 'Test', 'module' => 'Events', 'description' => 'x'])->save();

        $this->assertSame('', $a->prev_hash);
        $this->assertSame($a->row_hash, $b->prev_hash);
        $this->assertSame($b->row_hash, $c->prev_hash);   // the activity-log row in between did not join this chain
        $this->assertSame(0, $this->verify()[0]);
    }

    public function test_an_edited_report_is_named_including_a_change_inside_its_figures(): void
    {
        $this->report('One');
        $b = $this->report('Two');
        $this->report('Three');

        $this->tamper(fn () => DB::table('generated_reports')->where('id', $b->id)->update(['sections' => json_encode([['heading' => 'Members', 'rows' => [['Ana', 12], ['Ben', 700]]]])]));

        [$code, $out] = $this->verify();
        $this->assertSame(1, $code);
        $this->assertStringContainsString("Row #{$b->id} was edited", $out);
        $this->assertStringContainsString('TAMPERING DETECTED in the report history', $out);
        $this->assertSame(1, substr_count($out, 'Row #'));
    }

    public function test_an_edited_author_or_title_is_named(): void
    {
        $a = $this->report('One');

        $this->tamper(fn () => DB::table('generated_reports')->where('id', $a->id)->update(['user_code' => 'PR-0099']));

        $this->assertStringContainsString("Row #{$a->id} was edited", $this->verify()[1]);
    }

    public function test_a_removed_report_is_noticed_at_the_row_after_it(): void
    {
        $this->report('One');
        $b = $this->report('Two');
        $c = $this->report('Three');

        $this->tamper(fn () => DB::table('generated_reports')->where('id', $b->id)->delete());

        $this->assertStringContainsString("Row #{$c->id} does not follow the row before it", $this->verify()[1]);
    }

    public function test_a_report_planted_by_hand_is_noticed(): void
    {
        $this->report('One');
        DB::table('generated_reports')->insert(['user_code' => 'PR-0001', 'type' => 'budget', 'format' => 'pdf', 'title' => 'Forged budget report',
            'created_at' => now()->subDay()->toDateTimeString(), 'updated_at' => now()->subDay()->toDateTimeString()]);
        $planted = (int) DB::table('generated_reports')->max('id');

        $this->assertStringContainsString("Row #{$planted} has no fingerprint", $this->verify()[1]);
    }

    public function test_a_planted_report_with_a_made_up_fingerprint_is_noticed(): void
    {
        $this->report('One');
        DB::table('generated_reports')->insert(['user_code' => 'PR-0001', 'type' => 'budget', 'format' => 'pdf', 'title' => 'Forged',
            'prev_hash' => '', 'row_hash' => hash('sha256', 'forged'), 'created_at' => now()->subDay()->toDateTimeString(), 'updated_at' => now()->subDay()->toDateTimeString()]);
        $planted = (int) DB::table('generated_reports')->max('id');

        $out = $this->verify()[1];
        $this->assertStringContainsString("Row #{$planted} was edited", $out);   // the fingerprint cannot be made without the key
    }

    public function test_rows_cut_off_the_end_are_caught_with_a_checkpoint(): void
    {
        $this->report('One');
        $last = $this->report('Two');
        Artisan::call('log:verify', ['--anchor' => true]);
        $this->assertFileExists(AuditChain::anchorPath('generated_reports'));

        $this->tamper(fn () => DB::table('generated_reports')->where('id', $last->id)->delete());

        $this->assertStringContainsString("Row #{$last->id} is the saved checkpoint, but it is missing", $this->verify()[1]);
    }

    public function test_rows_from_before_the_chain_are_left_alone(): void
    {
        DB::table('generated_reports')->insert(['user_code' => 'PR-0009', 'type' => 'budget', 'format' => 'pdf', 'title' => 'Older', 'created_at' => now()->subYear()->toDateTimeString(), 'updated_at' => now()->subYear()->toDateTimeString()]);
        $this->report('New');

        [$code, $out] = $this->verify();
        $this->assertSame(0, $code, $out);
        $this->assertStringContainsString('Older, before the chain: 1', $out);
    }

    // ---------- the fingerprint itself ----------

    public function test_the_same_figures_give_the_same_fingerprint_however_the_json_is_ordered_or_spaced(): void
    {
        $a = AuditChain::fingerprint('', ['user_code' => 'PR-0001', 'type' => 'budget', 'format' => 'csv', 'title' => 'T', 'scope_label' => null, 'created_at' => '2026-11-20 10:00:00',
            'filters' => '{"b":2,"a":{"y":1,"x":[3,2]}}', 'sections' => null], 'generated_reports');
        $b = AuditChain::fingerprint('', ['user_code' => 'PR-0001', 'type' => 'budget', 'format' => 'csv', 'title' => 'T', 'scope_label' => null, 'created_at' => '2026-11-20 10:00:00',
            'filters' => '{ "a": {"x": [3, 2], "y": 1}, "b": 2 }', 'sections' => null], 'generated_reports');   // as MySQL's JSON type hands it back

        $this->assertSame($a, $b);
        $this->assertNotSame($a, AuditChain::fingerprint('', ['user_code' => 'PR-0001', 'type' => 'budget', 'format' => 'csv', 'title' => 'T', 'scope_label' => null, 'created_at' => '2026-11-20 10:00:00',
            'filters' => '{"b":2,"a":{"y":1,"x":[2,3]}}', 'sections' => null], 'generated_reports'));   // a different list order IS a different report
    }

    public function test_the_activity_log_fingerprint_is_unchanged_so_rows_written_before_still_verify(): void
    {
        config(['audit.key' => 'k']);
        $row = ['user_code' => 'PR-0001', 'action' => 'Update', 'module' => 'Events', 'description' => 'x', 'ip_address' => '10.0.0.1', 'created_at' => '2026-11-20 10:00:00'];

        // the formula the activity log has used since the chain was added, written out in full
        $expected = hash_hmac('sha256', json_encode(['', 'PR-0001', 'Update', 'Events', 'x', '10.0.0.1', '2026-11-20 10:00:00'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'k');

        $this->assertSame($expected, AuditChain::fingerprint(null, $row));
        $this->assertNotSame($expected, AuditChain::fingerprint(null, $row, 'generated_reports'));
    }

    // ---------- the migration ----------

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $a = $this->report('One');

        $m->down(false);
        DB::table('generated_reports')->where('id', $a->id)->update(['title' => 'edited while unlocked']);   // possible while unlocked
        $m->up();
        $m->up();

        $this->refused(fn () => DB::table('generated_reports')->where('id', $a->id)->update(['title' => 'again']), 'The report history cannot be changed');
    }

    public function test_stored_history_never_blocks_the_migration(): void
    {
        $m = $this->migration();
        $m->down();   // back to a report history with no chain columns and no lock
        DB::table('generated_reports')->insert(['user_code' => 'PR-0001', 'type' => 'budget', 'format' => 'pdf', 'title' => 'Before', 'created_at' => now()->subDay()->toDateTimeString(), 'updated_at' => now()->subDay()->toDateTimeString()]);
        $m->up();

        $this->assertSame(1, DB::table('generated_reports')->count());
        $this->assertNull(DB::table('generated_reports')->value('row_hash'));
    }
}

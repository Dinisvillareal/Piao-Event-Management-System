<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Support\AuditChain;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\Support;
use Tests\TestCase;

/**
 * The activity log is a hash chain (App\Support\AuditChain): editing a row, removing one, adding one by hand
 * or cutting rows off the end is detected by `php artisan log:verify`, which names the row.
 */
class ActivityLogChainTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        @unlink(AuditChain::anchorPath());
    }

    protected function tearDown(): void
    {
        @unlink(AuditChain::anchorPath());
        parent::tearDown();
    }

    private function add(string $description = 'x', array $extra = []): ActivityLog
    {
        $row = new ActivityLog();
        $row->forceFill(array_merge(['user_code' => 'PR-0001', 'action' => 'Update', 'module' => 'Events', 'description' => $description], $extra))->save();

        return $row->fresh();
    }

    private function verify(array $options = []): array
    {
        $code = Artisan::call('log:verify', $options);

        return [$code, Artisan::output()];
    }

    /** Changes a row the way a person with direct database access would: the add-only triggers are dropped first. */
    private function tamper(callable $change): void
    {
        $this->withoutTimeLocks($change);
    }

    public function test_every_new_row_stores_its_own_fingerprint_and_that_of_the_row_before(): void
    {
        $a = $this->add('first');
        $b = $this->add('second');
        $c = $this->add('third');

        $this->assertSame('', $a->prev_hash);
        $this->assertSame(64, strlen($a->row_hash));
        $this->assertSame($a->row_hash, $b->prev_hash);
        $this->assertSame($b->row_hash, $c->prev_hash);
        $this->assertCount(3, array_unique([$a->row_hash, $b->row_hash, $c->row_hash]));
    }

    public function test_an_untouched_log_verifies_and_the_app_itself_writes_into_the_chain(): void
    {
        $staff = $this->staff();
        $this->actingAs($staff)->postJson('/users', [
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'contact_number' => '09171234567', 'role' => 'Resident', 'has_account' => true, 'birth_date' => '1990-05-05',
            'password' => 'Passw0rd!Strong#1', 'password_confirmation' => 'Passw0rd!Strong#1',
        ])->assertStatus(201);
        $this->add('another');

        [$code, $out] = $this->verify();

        $this->assertSame(0, $code, $out);
        $this->assertStringContainsString('The activity log is intact', $out);
        $this->assertGreaterThanOrEqual(2, DB::table('activity_logs')->whereNotNull('row_hash')->count());
    }

    public function test_an_edited_row_is_named(): void
    {
        $this->add('one');
        $b = $this->add('two');
        $this->add('three');

        $this->tamper(fn () => DB::table('activity_logs')->where('id', $b->id)->update(['description' => 'two (changed by hand)']));

        [$code, $out] = $this->verify();
        $this->assertSame(1, $code);
        $this->assertStringContainsString("Row #{$b->id} was edited", $out);
        $this->assertSame(1, substr_count($out, 'Row #'), 'only the edited row is named');
    }

    public function test_an_edited_ip_address_or_time_is_named_too(): void
    {
        $a = $this->add('one', ['ip_address' => '10.0.0.5']);
        $b = $this->add('two');

        $this->tamper(fn () => DB::table('activity_logs')->where('id', $a->id)->update(['ip_address' => '6.6.6.6']));
        [, $out] = $this->verify();
        $this->assertStringContainsString("Row #{$a->id} was edited", $out);

        $this->tamper(fn () => DB::table('activity_logs')->where('id', $a->id)->update(['ip_address' => '10.0.0.5']));
        $this->assertSame(0, $this->verify()[0]);

        $this->tamper(fn () => DB::table('activity_logs')->where('id', $b->id)->update(['created_at' => now()->subYear()->toDateTimeString()]));
        $this->assertStringContainsString("Row #{$b->id} was edited", $this->verify()[1]);
    }

    public function test_a_removed_row_is_noticed_at_the_row_after_it(): void
    {
        $this->add('one');
        $b = $this->add('two');
        $c = $this->add('three');

        $this->tamper(fn () => DB::table('activity_logs')->where('id', $b->id)->delete());

        [$code, $out] = $this->verify();
        $this->assertSame(1, $code);
        $this->assertStringContainsString("Row #{$c->id} does not follow the row before it", $out);
    }

    public function test_a_row_slipped_in_by_hand_is_noticed(): void
    {
        $this->add('one');
        $this->add('two');
        DB::table('activity_logs')->insert(['user_code' => 'PR-0001', 'action' => 'Delete', 'module' => 'User', 'description' => 'planted', 'created_at' => now()->subDay()->toDateTimeString(), 'updated_at' => now()->subDay()->toDateTimeString()]);
        $planted = (int) DB::table('activity_logs')->max('id');

        [$code, $out] = $this->verify();
        $this->assertSame(1, $code);
        $this->assertStringContainsString("Row #{$planted} has no fingerprint", $out);
    }

    public function test_rows_from_before_the_chain_are_left_alone(): void
    {
        DB::table('activity_logs')->insert(['user_code' => 'PR-0009', 'action' => 'Old', 'module' => 'Events', 'description' => 'from before', 'created_at' => now()->subYear()->toDateTimeString(), 'updated_at' => now()->subYear()->toDateTimeString()]);
        $this->add('new one');
        $this->add('new two');

        [$code, $out] = $this->verify();
        $this->assertSame(0, $code, $out);
        $this->assertStringContainsString('Older, before the chain: 1', $out);
        $this->assertStringContainsString('Protected by the chain: 2', $out);
    }

    public function test_rows_cut_off_the_end_are_caught_once_a_checkpoint_is_saved(): void
    {
        $this->add('one');
        $this->add('two');
        $last = $this->add('three');

        $this->assertSame(0, $this->verify(['--anchor' => true])[0]);
        $this->assertFileExists(AuditChain::anchorPath());

        $this->tamper(fn () => DB::table('activity_logs')->where('id', $last->id)->delete());   // the chain alone cannot see this

        [$code, $out] = $this->verify();
        $this->assertSame(1, $code);
        $this->assertStringContainsString("Row #{$last->id} is the saved checkpoint, but it is missing", $out);
    }

    public function test_the_checkpoint_does_not_stop_the_log_from_growing(): void
    {
        $this->add('one');
        $this->verify(['--anchor' => true]);
        $this->add('two');
        $this->add('three');

        $this->assertSame(0, $this->verify()[0]);
    }

    public function test_the_fingerprint_needs_the_secret_key(): void
    {
        $this->add('one');
        $b = $this->add('two');

        // someone who edits a row and recalculates the fingerprint WITHOUT the key cannot make it match
        $forged = hash_hmac('sha256', 'guess', 'not-the-key');
        $this->tamper(fn () => DB::table('activity_logs')->where('id', $b->id)->update(['description' => 'edited', 'row_hash' => $forged]));
        [$code, $out] = $this->verify();
        $this->assertSame(1, $code);
        $this->assertStringContainsString("Row #{$b->id} was edited", $out);

        // and rows written under another key are reported, not trusted
        config(['audit.key' => 'a-different-key']);
        $this->assertSame(1, $this->verify()[0]);
    }

    public function test_the_fingerprints_never_appear_in_the_api_responses(): void
    {
        $staff = $this->staff();
        $this->add('visible');

        $json = $this->actingAs($staff)->getJson('/activity-logs')->assertOk()->getContent();
        $this->assertStringNotContainsString('row_hash', $json);
        $this->assertStringNotContainsString('prev_hash', $json);
        $this->assertStringContainsString('visible', $json);
    }

    public function test_the_fingerprints_cannot_be_changed_after_the_row_is_saved(): void
    {
        $a = $this->add('one');

        $this->expectException(\Illuminate\Database\QueryException::class);
        $this->expectExceptionMessage('The activity log cannot be changed');
        DB::table('activity_logs')->where('id', $a->id)->update(['row_hash' => str_repeat('0', 64)]);
    }

    public function test_the_seeded_log_joins_the_chain(): void
    {
        $this->seed();

        [$code, $out] = $this->verify();
        $this->assertSame(0, $code, $out);
        $this->assertGreaterThan(50, DB::table('activity_logs')->whereNotNull('row_hash')->count());
        $this->assertSame(0, DB::table('activity_logs')->whereNull('row_hash')->count());
    }
}

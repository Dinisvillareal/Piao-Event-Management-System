<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AgeBracket;
use App\Models\CivilStatus;
use App\Models\CurrentStatus;
use App\Models\Event;
use App\Models\EventExpense;
use App\Models\Household;
use App\Models\InventoryItem;
use App\Models\Membership;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Tests\Support;
use Tests\TestCase;

/**
 * The Archive: every kind of removed record is listed (one page at a time, filtered, sorted and
 * counted by the database), shows who removed it, and can be restored.
 */
class ArchiveTest extends TestCase
{
    use RefreshDatabase, Support;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
    }

    private function event(string $name = 'Fiesta'): Event
    {
        return Event::create([
            'name' => $name, 'description' => 'Test', 'location' => 'Hall',
            'event_start' => now()->addHours(3), 'event_end' => now()->addHours(5),
            'call_time_start' => now()->subHour(), 'call_time_end' => now()->addHours(6),
        ]);
    }

    /** One archived record of every kind, all removed by PR-777. Returns [type => id]. */
    private function archiveOneOfEach(): array
    {
        $ids = [];

        $m = Membership::create(['name' => 'Farmers Club', 'description' => 'x', 'deleted_by' => 'PR-777']);
        $m->delete();
        $ids['membership'] = $m->id;

        $e = $this->event('Clean-up Drive');
        $e->deleted_by = 'PR-777';
        $e->save();
        $e->delete();
        $ids['event'] = $e->id;

        $u = $this->makeUser('Resident', ['first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'deleted_by' => 'PR-777']);
        $u->delete();
        $ids['resident'] = $u->id;

        $a = AgeBracket::create(['label' => 'Teens', 'min_age' => 13, 'max_age' => 19, 'sort_order' => 9, 'deleted_by' => 'PR-777']);
        $a->delete();
        $ids['age_bracket'] = $a->id;

        $c = CivilStatus::create(['label' => 'Annulled', 'sort_order' => 9, 'deleted_by' => 'PR-777']);
        $c->delete();
        $ids['civil_status'] = $c->id;

        $s = CurrentStatus::create(['label' => 'Seasonal Worker', 'category' => 'other', 'sort_order' => 9, 'deleted_by' => 'PR-777']);
        $s->delete();
        $ids['current_status'] = $s->id;

        $i = InventoryItem::create(['name' => 'Spare Chairs', 'quantity' => 3, 'new_quantity' => 0, 'good_quantity' => 3, 'fair_quantity' => 0, 'poor_quantity' => 0, 'deleted_by' => 'PR-777']);
        $i->delete();
        $ids['inventory_item'] = $i->id;

        $x = $this->event('Budget Event')->expenses()->create(['item' => 'Tarpaulin', 'amount' => 250, 'receipt_path' => 'expense_receipts/1731900000_r.jpg', 'recorded_by' => 'PR-111', 'deleted_by' => 'PR-777']);
        $x->delete();
        $ids['expense'] = $x->id;

        $h = Household::create(['code' => 'HH-0042', 'deleted_by' => 'PR-777']);
        $h->delete();
        $ids['household'] = $h->id;

        return $ids;
    }

    private function archive(array $query = [], $user = null): array
    {
        return $this->actingAs($user ?? $this->staff())
            ->getJson('/api/archived?' . http_build_query($query + ['paged' => 1, 'per_page' => 100]))
            ->assertOk()->json();
    }

    private function names(array $json): array
    {
        return collect($json['data'])->pluck('name')->all();
    }

    // ---------------------------------------------------------------- listing

    public function test_every_kind_of_removed_record_is_listed_with_its_name_and_who_removed_it(): void
    {
        $ids = $this->archiveOneOfEach();

        $d = $this->archive();
        $byType = collect($d['data'])->keyBy('type');

        $this->assertEqualsCanonicalizing(array_keys($ids), $byType->keys()->all());
        $this->assertSame(
            ['membership' => 'Farmers Club', 'event' => 'Clean-up Drive', 'resident' => 'Juan Dela Cruz', 'age_bracket' => 'Teens',
             'civil_status' => 'Annulled', 'current_status' => 'Seasonal Worker', 'inventory_item' => 'Spare Chairs',
             'expense' => 'Tarpaulin', 'household' => 'HH-0042'],
            collect($ids)->keys()->mapWithKeys(fn ($t) => [$t => $byType[$t]['name']])->all()
        );
        foreach ($ids as $type => $id) {
            $this->assertSame($id, $byType[$type]['id'], "id of {$type}");
            $this->assertSame('PR-777', $byType[$type]['deletedBy'], "deleted by of {$type}");
            $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $byType[$type]['deletedAt']);
        }
    }

    public function test_an_expense_shows_who_deleted_it_not_who_recorded_it(): void
    {
        Storage::fake('public');
        $ana = $this->staff();
        $ben = $this->staff();
        $e = $this->event('Fiesta');
        $x = $this->actingAs($ana)->post("/events/{$e->id}/expenses", [
            'item' => 'Sound system', 'amount' => 900, 'receipt' => $this->fakeImage('r.jpg'),
        ], ['Accept' => 'application/json'])->assertStatus(201)->json('expense.id');

        $this->actingAs($ben)->deleteJson("/events/{$e->id}/expenses/{$x}")->assertOk();

        $row = collect($this->archive()['data'])->firstWhere('type', 'expense');
        $this->assertSame($ben->user_code, $row['deletedBy']);
        $this->assertNotSame($ana->user_code, $row['deletedBy']);
        $this->assertSame($ben->user_code, EventExpense::withTrashed()->find($x)->deleted_by);
    }

    public function test_a_cancelled_event_appears_as_the_event_and_as_its_announcement(): void
    {
        $staff = $this->staff();
        $e = $this->event('Sports Fest');
        Notification::create(['user_id' => $staff->id, 'event_id' => $e->id, 'type' => 'event_announcement', 'title' => 'New Event: Sports Fest', 'message' => 'm', 'read' => false]);

        $this->actingAs($staff)->deleteJson("/events/{$e->id}")->assertOk();

        $rows = collect($this->archive()['data'])->whereIn('type', ['event', 'notification'])->keyBy('type');
        $this->assertSame('Sports Fest', $rows['event']['name']);
        $this->assertSame($e->id, $rows['notification']['id']);
        $this->assertStringContainsString('Sports Fest', $rows['notification']['name']);
    }

    public function test_the_totals_cover_the_whole_archive_whatever_filter_is_on_screen(): void
    {
        $this->archiveOneOfEach();

        $d = $this->archive(['type' => 'resident']);

        $this->assertCount(1, $d['data']);
        $this->assertSame(9, $d['stats']['total']);
        $this->assertSame(9, $d['stats']['distinct_types']);
        $this->assertNotNull($d['stats']['newest_at']);
        $this->assertSame(0, $d['stats']['oldest_days']);
    }

    public function test_an_empty_archive_has_zero_totals(): void
    {
        $d = $this->archive();

        $this->assertSame([], $d['data']);
        $this->assertSame(0, $d['stats']['total']);
        $this->assertNull($d['stats']['newest_at']);
        $this->assertSame(0, $d['meta']['total']);
    }

    // ---------------------------------------------------------------- filter, search, sort, pages

    public function test_the_type_filter_returns_only_that_kind(): void
    {
        $this->archiveOneOfEach();

        $this->assertSame(['Spare Chairs'], $this->names($this->archive(['type' => 'inventory_item'])));
        $this->assertSame(['HH-0042'], $this->names($this->archive(['type' => 'household'])));
        $this->assertCount(9, $this->archive(['type' => 'all'])['data']);
    }

    public function test_search_matches_name_kind_and_who_removed_it_and_every_word_must_match(): void
    {
        $this->archiveOneOfEach();

        $this->assertSame(['Juan Dela Cruz'], $this->names($this->archive(['search' => 'dela cruz'])));
        $this->assertSame(['Juan Dela Cruz'], $this->names($this->archive(['search' => 'cruz JUAN'])));
        $this->assertSame(['Spare Chairs'], $this->names($this->archive(['search' => 'inventory'])));
        $this->assertCount(9, $this->archive(['search' => 'pr-777'])['data']);
        $this->assertSame([], $this->names($this->archive(['search' => 'juan tarpaulin'])));
    }

    public function test_percent_and_underscore_in_the_search_are_matched_literally(): void
    {
        $this->archiveOneOfEach();
        $i = InventoryItem::create(['name' => '100% Cotton Mats', 'quantity' => 1, 'new_quantity' => 0, 'good_quantity' => 1, 'fair_quantity' => 0, 'poor_quantity' => 0]);
        $this->archived($i);

        $this->assertSame(['100% Cotton Mats'], $this->names($this->archive(['search' => '%'])));
        $this->assertSame([], $this->names($this->archive(['search' => 'Spare_Chairs'])));
    }

    public function test_sorting_by_name_and_by_oldest_and_newest(): void
    {
        $a = Membership::create(['name' => 'Bravo', 'description' => 'x']);
        $b = Membership::create(['name' => 'alpha', 'description' => 'x']);
        $c = Membership::create(['name' => 'Charlie', 'description' => 'x']);
        foreach ([[$a, '2026-11-01 08:00:00'], [$b, '2026-11-03 08:00:00'], [$c, '2026-11-02 08:00:00']] as [$m, $at]) {
            $this->archived($m);
            // back-dating an archive time is test set-up that no screen can do (the database refuses to re-date it)
            $this->withoutTimeLocks(fn () => Membership::withTrashed()->where('id', $m->id)->update(['deleted_at' => $at]));
        }

        $this->assertSame(['alpha', 'Bravo', 'Charlie'], $this->names($this->archive(['sort' => 'name-az'])));
        $this->assertSame(['Bravo', 'Charlie', 'alpha'], $this->names($this->archive(['sort' => 'oldest'])));
        $this->assertSame(['alpha', 'Charlie', 'Bravo'], $this->names($this->archive()));
    }

    public function test_the_archive_is_paged_by_the_database(): void
    {
        foreach (range(1, 23) as $n) {
            $m = Membership::create(['name' => sprintf('Club %02d', $n), 'description' => 'x']);
            $this->archived($m);
        }

        $p1 = $this->archive(['per_page' => 10, 'page' => 1, 'sort' => 'name-az']);
        $p3 = $this->archive(['per_page' => 10, 'page' => 3, 'sort' => 'name-az']);

        $this->assertCount(10, $p1['data']);
        $this->assertSame(23, $p1['meta']['total']);
        $this->assertSame(3, $p1['meta']['last_page']);
        $this->assertSame('Club 01', $p1['data'][0]['name']);
        $this->assertSame(['Club 21', 'Club 22', 'Club 23'], $this->names($p3));
    }

    public function test_only_staff_can_open_the_archive(): void
    {
        $this->actingAs($this->makeUser('Resident'))->getJson('/api/archived?paged=1')->assertStatus(403);
        $this->actingAs($this->makeUser('Resident'))->postJson('/api/archive/restore', ['type' => 'household', 'id' => 1])->assertStatus(403);
        auth()->logout();
        $this->getJson('/api/archived?paged=1')->assertStatus(401);
    }

    // ---------------------------------------------------------------- restore, every kind

    public function test_every_kind_of_record_can_be_restored_and_leaves_the_archive(): void
    {
        $ids = $this->archiveOneOfEach();
        $staff = $this->staff();

        foreach ($ids as $type => $id) {
            $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => $type, 'id' => $id])
                ->assertOk()->assertJsonPath('message', 'Item restored successfully');
        }

        $this->assertNull(Membership::withTrashed()->find($ids['membership'])->deleted_at);
        $this->assertNull(Event::withTrashed()->find($ids['event'])->deleted_at);
        $this->assertNull(User::withTrashed()->find($ids['resident'])->deleted_at);
        $this->assertNull(AgeBracket::withTrashed()->find($ids['age_bracket'])->deleted_at);
        $this->assertNull(CivilStatus::withTrashed()->find($ids['civil_status'])->deleted_at);
        $this->assertNull(CurrentStatus::withTrashed()->find($ids['current_status'])->deleted_at);
        $this->assertNull(InventoryItem::withTrashed()->find($ids['inventory_item'])->deleted_at);
        $this->assertNull(EventExpense::withTrashed()->find($ids['expense'])->deleted_at);
        $this->assertNull(Household::withTrashed()->find($ids['household'])->deleted_at);

        $this->assertSame(0, $this->archive()['stats']['total']);
        $this->assertSame(9, ActivityLog::where('action', 'Restore')->count(), 'every restore is logged exactly once');
        $this->assertSame(0, ActivityLog::where('description', "Restored event ''")->count(), 'no blank-name log line');
    }

    public function test_a_restored_record_no_longer_carries_the_name_of_who_removed_it(): void
    {
        $ids = $this->archiveOneOfEach();

        $this->actingAs($this->staff())->postJson('/api/archive/restore', ['type' => 'household', 'id' => $ids['household']])->assertOk();
        $this->actingAs($this->staff())->postJson('/api/archive/restore', ['type' => 'expense', 'id' => $ids['expense']])->assertOk();

        $this->assertNull(Household::find($ids['household'])->deleted_by);
        $this->assertNull(EventExpense::find($ids['expense'])->deleted_by);
    }

    public function test_the_cancelled_events_announcement_restores_the_event(): void
    {
        $staff = $this->staff();
        $e = $this->event('Sports Fest');
        Notification::create(['user_id' => $staff->id, 'event_id' => $e->id, 'type' => 'event_announcement', 'title' => 'New Event: Sports Fest', 'message' => 'm', 'read' => false]);
        $this->actingAs($staff)->deleteJson("/events/{$e->id}")->assertOk();

        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'notification', 'id' => $e->id])->assertOk();

        $this->assertNull(Event::withTrashed()->find($e->id)->deleted_at);
        $this->assertSame([], collect($this->archive(['type' => 'event'])['data'])->all());
    }

    public function test_restoring_something_that_is_not_archived_or_not_a_known_kind_is_refused(): void
    {
        $staff = $this->staff();

        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'household', 'id' => 99999])->assertStatus(500);
        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'bank_account', 'id' => 1])->assertStatus(422);
        $this->actingAs($staff)->postJson('/api/archive/restore', ['type' => 'household'])->assertStatus(422);
    }

    public function test_nothing_can_be_permanently_deleted_from_the_archive(): void
    {
        $ids = $this->archiveOneOfEach();

        $this->actingAs($this->staff())->postJson('/api/archive/force-delete', ['type' => 'household', 'id' => $ids['household']]);

        $this->assertNotNull(Household::withTrashed()->find($ids['household']), 'the record is still there');
    }
}

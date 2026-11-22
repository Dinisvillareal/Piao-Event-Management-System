<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Migration 2026_11_19_000024 removes the two photo columns that the "undo a return" action never filled. */
class UndoPhotoRemovalTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_19_000024_drop_unused_undo_photos.php');
    }

    private function triggers(string $like): array
    {
        return array_map(fn ($r) => $r->name, DB::select("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE ?", [$like]));
    }

    public function test_the_unused_undo_photo_columns_and_their_locks_are_gone(): void
    {
        $this->assertFalse(Schema::hasColumn('event_inventory_release_undos', 'photo_path'));
        $this->assertFalse(Schema::hasColumn('event_inventory_releases', 'undo_photo_path'));
        $this->assertSame([], $this->triggers('lock_event_inventory_release_undos_photo_path%'));
        $this->assertSame([], $this->triggers('lock_event_inventory_releases_undo_photo_path%'));
        $this->assertNotEmpty($this->triggers('lock_event_inventory_releases_evidence_photo_path%'));   // the return's own photo keeps its lock
    }

    public function test_the_migration_can_be_rolled_back_and_run_again(): void
    {
        $m = $this->migration();
        $m->up();   // twice in a row is safe
        $m->down();
        $this->assertTrue(Schema::hasColumn('event_inventory_release_undos', 'photo_path'));
        $this->assertTrue(Schema::hasColumn('event_inventory_releases', 'undo_photo_path'));
        $m->up();
        $this->assertFalse(Schema::hasColumn('event_inventory_release_undos', 'photo_path'));
        $this->assertFalse(Schema::hasColumn('event_inventory_releases', 'undo_photo_path'));
    }
}

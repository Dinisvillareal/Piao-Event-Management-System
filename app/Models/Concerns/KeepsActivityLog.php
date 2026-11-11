<?php

namespace App\Models\Concerns;

use Illuminate\Support\Facades\Storage;

/**
 * An edit trail for records that are corrected after the fact (a return, an
 * expense). Every edit is appended to the record's `activity_log` -- what
 * changed (field, from, to), who did it and when -- so the original values are
 * never lost, the same way the Found entries in Inventory keep their history.
 *
 * Evidence is never thrown away either: photos / receipts that an edit
 * replaced or removed stay on disk and are listed on that edit's entry.
 *
 * Needs an `activity_log` JSON column cast to array on the model.
 */
trait KeepsActivityLog
{
    /**
     * Appends one edit to the trail. $changes is a list of
     * ['field' => string, 'from' => scalar|null, 'to' => scalar|null];
     * $photos are the storage paths the edit replaced or removed (kept on
     * disk, never deleted) and $added the ones it attached.
     * Does nothing when there is nothing to record. Call save() afterwards.
     */
    public function logEdit(array $changes, array $photos = [], array $added = []): void
    {
        $photos = array_values(array_filter($photos));
        $added = array_values(array_filter($added));
        if (!$changes && !$photos && !$added) {
            return;
        }

        $log = $this->activity_log ?? [];
        $log[] = [
            'by' => auth()->user()?->user_code,
            'at' => now()->toIso8601String(),
            'changes' => array_values($changes),
            'photos' => $photos,
            'added' => $added,
        ];
        $this->activity_log = $log;
    }

    /** The trail as the screens need it: public URLs, who and when, newest first. */
    public function getActivityLogUrlsAttribute(): array
    {
        $entries = collect($this->activity_log ?? []);
        $people = [];
        $codes = $entries->pluck('by')->filter()->unique()->values();
        if ($codes->isNotEmpty()) {
            $people = \App\Models\User::whereIn('user_code', $codes)->get(['user_code', 'first_name', 'last_name'])->keyBy('user_code')->all();
        }

        return $entries
            ->map(fn ($h) => [
                'changes' => $h['changes'] ?? [],
                'photo_urls' => array_map(fn ($p) => Storage::disk('public')->url($p), $h['photos'] ?? []),
                'added_urls' => array_map(fn ($p) => Storage::disk('public')->url($p), $h['added'] ?? []),
                'by' => isset($people[$h['by'] ?? null]) ? trim($people[$h['by']]->first_name . ' ' . $people[$h['by']]->last_name) : ($h['by'] ?? null),
                'at' => $h['at'] ?? null,
            ])
            ->reverse()
            ->values()
            ->all();
    }
}

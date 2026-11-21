<?php

namespace App\Support;

use App\Models\AttendanceScan;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The attendance scan ledger (attendance_scans) and its reconciliation with `attendances`.
 *
 * Every real sign-in and sign-out is written once to the ledger, and `attendances` is the summary of it.
 * For every person and event the two must agree:
 *
 *   sign-in time   attendances.time_in   = the "in" scan in the ledger (none when there is none)
 *   sign-out time  attendances.time_out  = the "out" scan in the ledger
 *   status         missed with no scan, Incomplete with one, Complete with both
 *   one of each    at most one "in" and one "out" per person and event after the last "void"
 *   no ghosts      scans in the ledger need an attendance row, unless the last entry is a "void"
 *
 * A difference means a time or status was changed, a row was added or removed, or a ledger entry was planted,
 * outside the app. Rows that existed before the ledger do not reconcile until their scans are written down:
 * adopt() records them as explicit entries (user SYSTEM, source "system") instead of hiding them.
 */
class AttendanceLedger
{
    public const VOID_NOTE = 'Removed: no longer eligible for the event';

    /** Writes one entry. $at is the time the scan really happened (null for a void). */
    public static function record(string $kind, int $eventId, int $userId, ?Carbon $at, string $source = 'scan', ?string $note = null, ?string $by = null): AttendanceScan
    {
        return AttendanceScan::create([
            'event_id' => $eventId,
            'user_id' => $userId,
            'kind' => $kind,
            'scanned_at' => $at?->copy()->timezone(config('app.timezone'))->toDateTimeString(),
            'source' => $source,
            'recorded_by' => $by ?? auth()->user()?->user_code ?? 'SYSTEM',
            'note' => $note,
        ]);
    }

    /** Voids the scans of a person for an event, which is what allows their attendance row to be removed. */
    public static function void(int $eventId, int $userId, string $note = self::VOID_NOTE): AttendanceScan
    {
        return self::record('void', $eventId, $userId, null, 'system', $note);
    }

    private static function time($value): ?string
    {
        return $value === null || $value === '' ? null : Carbon::parse($value)->format('Y-m-d H:i:s');
    }

    /**
     * @return array<int,array{event_id:int,user_id:int,problem:string,adopt:?array{kind:string,at:string}}>
     */
    public static function check(): array
    {
        $rows = [];
        foreach (DB::table('attendances')->select(['event_id', 'user_id', 'time_in', 'time_out', 'status'])->get() as $r) {
            $rows[$r->event_id . '-' . $r->user_id] = $r;
        }

        $entries = [];
        DB::table('attendance_scans')->orderBy('id')->select(['id', 'event_id', 'user_id', 'kind', 'scanned_at'])
            ->chunkById(1000, function ($chunk) use (&$entries) {
                foreach ($chunk as $e) {
                    $entries[$e->event_id . '-' . $e->user_id][] = $e;
                }
            });

        $problems = [];
        $keys = array_unique(array_merge(array_keys($rows), array_keys($entries)));
        sort($keys, SORT_NATURAL);

        foreach ($keys as $key) {
            [$eventId, $userId] = array_map('intval', explode('-', $key));
            $row = $rows[$key] ?? null;
            $list = $entries[$key] ?? [];
            $add = function (string $problem, ?array $adopt = null) use (&$problems, $eventId, $userId) {
                $problems[] = ['event_id' => $eventId, 'user_id' => $userId, 'problem' => $problem, 'adopt' => $adopt];
            };

            $lastIsVoid = $list && end($list)->kind === 'void';
            $live = [];
            foreach ($list as $e) {
                $e->kind === 'void' ? $live = [] : $live[] = $e;
            }
            $ins = array_values(array_filter($live, fn ($e) => $e->kind === 'in'));
            $outs = array_values(array_filter($live, fn ($e) => $e->kind === 'out'));

            if (!$row) {
                if ($live) {
                    $add('has scans in the ledger but no attendance row (the row was removed without voiding its scans)');
                }
                continue;
            }

            if ($lastIsVoid && ($row->time_in || $row->time_out)) {
                $add('was voided in the ledger but its attendance row still holds a scan');
                continue;
            }
            if (count($ins) > 1 || count($outs) > 1) {
                $add('has more than one sign-in or sign-out in the ledger');
                continue;
            }

            foreach (['in' => ['time_in', $ins], 'out' => ['time_out', $outs]] as $kind => [$column, $found]) {
                $have = self::time($row->{$column});
                $want = $found ? self::time($found[0]->scanned_at) : null;

                if ($have !== null && $want === null) {
                    $add("has a sign-" . $kind . " time ({$have}) with no scan behind it in the ledger", ['kind' => $kind, 'at' => $have]);
                } elseif ($have === null && $want !== null) {
                    $add("has a sign-{$kind} in the ledger ({$want}) but the attendance row has none (the time was erased)");
                } elseif ($have !== null && $have !== $want) {
                    $add("has a sign-{$kind} time of {$have} but the ledger says {$want}");
                }
            }

            $expected = $row->time_in && $row->time_out ? 'complete' : ($row->time_in || $row->time_out ? 'incomplete' : 'missed');
            if (strtolower((string) $row->status) !== $expected) {
                $add("has the status \"{$row->status}\" but its scans say " . $expected);
            }
        }

        return $problems;
    }

    /**
     * Writes the scans of rows that existed before the ledger down as explicit entries (source "system"), so the
     * ledger agrees with them and the history stays visible. Only rows with no ledger entry for that scan are
     * adopted; any other difference is a real mismatch and is left to be investigated. Returns how many were written.
     */
    public static function adopt(): int
    {
        $written = 0;

        foreach (self::check() as $p) {
            if (!$p['adopt']) {
                continue;
            }
            self::record($p['adopt']['kind'], $p['event_id'], $p['user_id'], Carbon::parse($p['adopt']['at']), 'system', 'Opening record: this scan was made before the ledger existed', 'SYSTEM');
            $written++;
        }

        return $written;
    }
}

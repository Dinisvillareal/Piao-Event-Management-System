<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Tamper evidence for the activity log, the report history, the inventory ledger and the attendance scan ledger (a hash chain per table).
 *
 * Each row stores a fingerprint of its own content together with the fingerprint of the row
 * before it. Editing a row changes its fingerprint; removing, adding or re-ordering rows breaks
 * the link to the next one. The fingerprint is an HMAC, so it also needs a secret key that is
 * kept outside the database (config/audit.php); a person with database access alone cannot
 * recalculate the chain after changing a row.
 *
 * Rows saved before the chain existed carry no fingerprint and are left alone. A checkpoint
 * (the newest row and its fingerprint, saved with `log:verify --anchor`) additionally catches
 * rows cut off the end of the log, which a chain by itself cannot show.
 */
class AuditChain
{
    /**
     * The tables that form a chain: the fields a fingerprint covers (in order), which of them hold JSON, a tag that
     * keeps the chains of different tables apart (the activity log has none, so its older fingerprints stay valid),
     * and the file its checkpoint is saved in.
     */
    public const TABLES = [
        'activity_logs' => [
            'fields' => ['user_code', 'action', 'module', 'description', 'ip_address', 'created_at'],
            'json'   => [],
            'tag'    => null,
            'anchor' => 'audit-anchor.json',
        ],
        'generated_reports' => [
            'fields' => ['user_code', 'type', 'format', 'title', 'scope_label', 'filters', 'sections', 'created_at'],
            'json'   => ['filters', 'sections'],
            'tag'    => 'generated_reports',
            'anchor' => 'audit-anchor-generated_reports.json',
        ],
        // the undo marker (undone_at, undone_by) is not covered: it is the one thing that may change later
        'inventory_unit_logs' => [
            'fields' => ['inventory_item_id', 'event_id', 'action', 'quantity', 'units', 'photo_path', 'extra_photo_paths', 'user_code', 'created_at'],
            'json'   => ['units', 'extra_photo_paths'],
            'tag'    => 'inventory_unit_logs',
            'anchor' => 'audit-anchor-inventory_unit_logs.json',
        ],
        'attendance_scans' => [
            'fields' => ['event_id', 'user_id', 'kind', 'scanned_at', 'source', 'recorded_by', 'note', 'created_at'],
            'json'   => [],
            'tag'    => 'attendance_scans',
            'anchor' => 'audit-anchor-attendance_scans.json',
        ],
    ];

    /** Kept for the activity log. */
    public const FIELDS = self::TABLES['activity_logs']['fields'];

    public static function anchorPath(string $table = 'activity_logs'): string
    {
        return storage_path('app/' . self::TABLES[$table]['anchor']);
    }

    /**
     * JSON in one fixed shape, so the same data gives the same text however it was written or read back
     * (MySQL's JSON type re-orders keys and re-spaces the text).
     */
    public static function canonicalJson(?string $json): ?string
    {
        if ($json === null) {
            return null;
        }
        $data = json_decode($json, true);
        if ($data === null && strtolower(trim($json)) !== 'null') {
            return $json;   // not JSON at all: judged as it is
        }
        $sort = function (&$value) use (&$sort) {
            if (is_array($value)) {
                ksort($value);
                foreach ($value as &$inner) {
                    $sort($inner);
                }
            }
        };
        $sort($data);

        return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function fingerprint(?string $previous, array $row, string $table = 'activity_logs'): string
    {
        $config = self::TABLES[$table];
        $payload = $config['tag'] === null ? [(string) $previous] : [$config['tag'], (string) $previous];
        foreach ($config['fields'] as $field) {
            $value = $row[$field] ?? null;
            if ($value !== null && in_array($field, $config['json'], true)) {
                $value = self::canonicalJson(is_string($value) ? $value : json_encode($value));
            }
            $payload[] = $value === null ? null : (string) $value;
        }

        $key = (string) (config('audit.key') ?: 'piao-connect-activity-log');

        return hash_hmac('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $key);
    }

    /**
     * Walks the whole log, oldest first.
     *
     * @return array{rows:int, chained:int, unchained:int, problems:array<int,array{id:int,problem:string}>, head:?array{id:int,hash:string}, anchor:?array}
     */
    public static function check(string $table = 'activity_logs'): array
    {
        $problems = [];
        $rows = $chained = $unchained = 0;
        $started = false;
        $expected = '';
        $head = null;
        $ids = [];
        $anchor = is_file(self::anchorPath($table)) ? json_decode((string) file_get_contents(self::anchorPath($table)), true) : null;
        $anchorSeen = null;

        DB::table($table)->orderBy('id')->select(array_merge(['id', 'prev_hash', 'row_hash'], self::TABLES[$table]['fields']))
            ->chunkById(1000, function ($chunk) use (&$problems, &$rows, &$chained, &$unchained, &$started, &$expected, &$head, $anchor, &$anchorSeen, $table) {
                foreach ($chunk as $r) {
                    $rows++;

                    if ($r->row_hash === null) {
                        if ($started) {
                            $problems[] = ['id' => (int) $r->id, 'problem' => 'has no fingerprint but comes after fingerprinted rows (it was added outside the application)'];
                        } else {
                            $unchained++;
                        }
                        continue;
                    }

                    $started = true;
                    $chained++;

                    if ((string) $r->prev_hash !== $expected) {
                        $problems[] = ['id' => (int) $r->id, 'problem' => 'does not follow the row before it (a row in between was removed, added or changed)'];
                    }
                    if (!hash_equals(self::fingerprint($r->prev_hash, (array) $r, $table), (string) $r->row_hash)) {
                        $problems[] = ['id' => (int) $r->id, 'problem' => 'was edited: its content no longer matches its fingerprint'];
                    }

                    $expected = (string) $r->row_hash;
                    $head = ['id' => (int) $r->id, 'hash' => (string) $r->row_hash];

                    if ($anchor && (int) $r->id === (int) ($anchor['id'] ?? 0)) {
                        $anchorSeen = (string) $r->row_hash;
                    }
                }
            });

        if ($anchor) {
            if ($anchorSeen === null) {
                $problems[] = ['id' => (int) $anchor['id'], 'problem' => 'is the saved checkpoint, but it is missing (rows were removed from the end of the log)'];
            } elseif (!hash_equals((string) $anchor['hash'], $anchorSeen)) {
                $problems[] = ['id' => (int) $anchor['id'], 'problem' => 'is the saved checkpoint, but its fingerprint has changed'];
            }
        }

        return compact('rows', 'chained', 'unchained', 'problems', 'head', 'anchor');
    }
}

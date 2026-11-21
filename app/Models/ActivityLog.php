<?php

namespace App\Models;

use App\Models\Concerns\JoinsHashChain;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivityLog extends Model
{
    use HasFactory, JoinsHashChain;

    protected $table = 'activity_logs';

    protected $fillable = [
        'user_code',
        'action',
        'module',
        'description',
    ];   // the time and the IP address are written by the system only, never from a request

    // IMPORTANT: ensure timestamps are enabled
    public $timestamps = true;

    /** The chain fingerprints are for verification only; they never leave the server in a response. */
    protected $hidden = ['prev_hash', 'row_hash'];

    /**
     * Screen filter name => the module name stored in the log. One list, used by the
     * on-screen log and by its printed / exported report, so they always agree.
     */
    public const MODULE_FILTERS = [
        'event'        => 'Events',
        'resident'     => 'User',
        'membership'   => 'Membership',
        'notification' => 'Notifications',
        'scan'         => 'QR',
        'system'       => 'Authentication',
        'inventory'    => 'Inventory',
        'budget'       => 'Budget',
        'household'    => 'Households',
        'profiling'    => 'Profiling Settings',
        'archive'      => 'Archive',
        'report'       => 'Reports',
    ];

    /** Filled in before the chain fingerprint is calculated: the device the action came from. */
    protected function beforeChain(): void
    {
        if ($this->ip_address === null && app()->bound('request')) {
            $this->ip_address = request()->ip();
        }
    }

    protected static function booted(): void
    {
        // Every new log row remembers the device it came from, wherever it is written
        // (controllers, services, ...). Console / queue work has no request, so stays empty.
        static::creating(function (self $log) {
            if ($log->ip_address === null && app()->bound('request')) {
                $log->ip_address = request()->ip();
            }
        });
    }

    /**
     * The one set of filters for the activity log: free-text search (LIKE wildcards typed by
     * the user are matched literally), module, a single day (Manila time) and a day range.
     *
     * @param  array{search?:?string,type?:?string,date?:?string,date_from?:?string,date_to?:?string}  $f
     */
    public function scopeFiltered(Builder $query, array $f): Builder
    {
        $search = trim((string) ($f['search'] ?? ''));
        if ($search !== '') {
            $like = '%' . addcslashes(mb_substr($search, 0, 100), '\\%_') . '%';
            // MySQL reads the backslash as the escape character by default; SQLite must be told.
            $esc = $query->getConnection()->getDriverName() === 'sqlite' ? " ESCAPE '\\'" : '';
            $query->where(function ($q) use ($like, $esc) {
                foreach (['user_code', 'action', 'module', 'description'] as $i => $column) {
                    $q->{$i === 0 ? 'whereRaw' : 'orWhereRaw'}("{$column} LIKE ?{$esc}", [$like]);
                }
            });
        }

        $type = $f['type'] ?? null;
        if ($type && $type !== 'all' && isset(self::MODULE_FILTERS[$type])) {
            // Older rows were saved under module 'Residents'; keep them in the Residents filter.
            $query->whereIn('module', $type === 'resident' ? ['User', 'Residents'] : [self::MODULE_FILTERS[$type]]);
        }

        // One chosen day, or a from/to range. A day runs from 00:00:00 up to, but NOT including,
        // 00:00:00 of the next day, so a row stamped exactly at midnight belongs to one day only.
        if (!empty($f['date'])) {
            $day = self::parseDay($f['date']);
            if ($day) {
                $query->where('created_at', '>=', $day)->where('created_at', '<', $day->copy()->addDay());
            }
        } else {
            $from = !empty($f['date_from']) ? self::parseDay($f['date_from']) : null;
            $to = !empty($f['date_to']) ? self::parseDay($f['date_to']) : null;
            if ($from) {
                $query->where('created_at', '>=', $from);
            }
            if ($to) {
                $query->where('created_at', '<', $to->copy()->addDay());
            }
        }

        return $query;
    }

    private static function parseDay(string $value): ?Carbon
    {
        try {
            return Carbon::parse($value, 'Asia/Manila')->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}

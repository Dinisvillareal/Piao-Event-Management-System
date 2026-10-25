<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

// Admin-editable rules stored as key => JSON value.
class AppSetting extends Model
{
    protected $fillable = ['key', 'value'];

    protected $casts = ['value' => 'array'];

    public const FEEDBACK_DEFAULTS = [
        // Members can send feedback from the moment an event ends until this many hours later.
        'close_after_hours' => 12,
        // After the first submit a member may change it for this many minutes (0 = no edits).
        'edit_window_minutes' => 30,
    ];

    public static function feedbackRules(): array
    {
        $stored = [];
        try {
            if (Schema::hasTable('app_settings')) {
                $stored = static::where('key', 'feedback_rules')->value('value') ?? [];
            }
        } catch (\Throwable $e) {
            // Table not migrated yet -- fall back to the defaults.
        }

        return [
            'close_after_hours' => max(1, (int) ($stored['close_after_hours'] ?? self::FEEDBACK_DEFAULTS['close_after_hours'])),
            'edit_window_minutes' => max(0, (int) ($stored['edit_window_minutes'] ?? self::FEEDBACK_DEFAULTS['edit_window_minutes'])),
        ];
    }

    public static function saveFeedbackRules(int $closeAfterHours, int $editWindowMinutes): array
    {
        static::updateOrCreate(
            ['key' => 'feedback_rules'],
            ['value' => ['close_after_hours' => $closeAfterHours, 'edit_window_minutes' => $editWindowMinutes]]
        );

        return static::feedbackRules();
    }
}

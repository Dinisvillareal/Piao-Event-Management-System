<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class AppSetting extends Model
{
    protected $fillable = ['key', 'value'];

    protected $casts = ['value' => 'array'];

    /**
     * Fallback used ONLY when Settings → Feedback Rules has never been
     * saved. The running values are always read from AppSetting at
     * runtime — these constants are never returned to the caller as-is.
     */
    public const DEFAULT_CLOSE_AFTER_HOURS   = 12;   // 12 hours after event ends
    public const DEFAULT_EDIT_WINDOW_MINUTES = 20;   // 20 minutes after first submit

    /**
     * Returns the current feedback rules. Reads from the app_settings
     * table (key = 'feedback_rules'); falls back to the constants above
     * when the table doesn't exist yet or nothing was ever saved.
     *
     * Existing feedback rows are NOT affected by later changes to these
     * values — FeedbackController freezes the values onto each record
     * on first submission (see feedback.close_after_hours /
     * feedback.edit_window_minutes columns).
     */
    public static function feedbackRules(): array
    {
        $defaults = [
            'close_after_hours'   => self::DEFAULT_CLOSE_AFTER_HOURS,
            'edit_window_minutes' => self::DEFAULT_EDIT_WINDOW_MINUTES,
        ];

        // Fresh installs may run this before `app_settings` is migrated.
        if (!Schema::hasTable('app_settings')) {
            return $defaults;
        }

        $stored = static::where('key', 'feedback_rules')->value('value') ?? [];

        return [
            'close_after_hours'   => (int) ($stored['close_after_hours']   ?? $defaults['close_after_hours']),
            'edit_window_minutes' => (int) ($stored['edit_window_minutes'] ?? $defaults['edit_window_minutes']),
        ];
    }

    /**
     * Persist new feedback rules. Called from
     * FeedbackController::updateRules() (Head Staff only, password
     * re-checked). Returns the freshly saved values.
     */
    public static function saveFeedbackRules(int $closeAfterHours, int $editWindowMinutes): array
    {
        static::updateOrCreate(
            ['key' => 'feedback_rules'],
            ['value' => [
                'close_after_hours'   => $closeAfterHours,
                'edit_window_minutes' => $editWindowMinutes,
            ]]
        );

        return static::feedbackRules();
    }
}
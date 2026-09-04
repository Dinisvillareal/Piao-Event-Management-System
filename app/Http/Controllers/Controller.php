<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Support\Carbon;

abstract class Controller
{
    /**
     * True when the authenticated user is Staff.
     *
     * Centralized here so every controller shares ONE definition of
     * "staff" instead of each controller redefining its own private
     * copy. Previously this same one-line check was copy-pasted into
     * ~14 controllers separately -- meaning there was no single place
     * to audit or change who counts as staff, and a new controller
     * could easily forget the check entirely. Now it's defined once
     * and inherited by every controller in the app.
     */
    protected function isStaff(): bool
    {
        return auth()->user()?->role === 'Staff';
    }

    /**
     * Write one activity-log row.
     *
     * Supports both calling styles that existed across the codebase
     * before this was centralized, so no call site needs to change:
     *
     *   $this->createLog($action, $module, $description)   // explicit module
     *   $this->createLog($action, $description)             // module comes
     *                                                         // from $this->logModule
     *
     * A controller that always logs to the same module (e.g.
     * InventoryController -> "Inventory") declares:
     *
     *   protected $logModule = 'Inventory';
     *
     * and can then call the 2-arg form. $at lets a caller backdate/
     * order entries deliberately (see EventController, which staggers
     * a "Create event" row and its paired "Sent notification" row by
     * a few hundred milliseconds so they display in the right order
     * in the activity feed) -- ActivityLog has auto timestamps, so
     * $at only needs to be passed when that default isn't good enough.
     */
    protected function createLog(string $action, string $moduleOrDescription, ?string $description = null, ?Carbon $at = null): void
    {
        if ($description === null) {
            $module = $this->logModule ?? 'System';
            $description = $moduleOrDescription;
        } else {
            $module = $moduleOrDescription;
        }

        $row = [
            'user_code'   => auth()->user()?->user_code ?? 'SYSTEM',
            'action'      => $action,
            'module'      => $module,
            'description' => $description,
        ];

        if ($at !== null) {
            $row['created_at'] = $at;
            $row['updated_at'] = $at;
        }

        ActivityLog::create($row);
    }
}

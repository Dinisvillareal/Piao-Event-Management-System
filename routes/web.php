<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;
use App\Http\Controllers\MembershipController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\MembershipResidentController;
use App\Http\Controllers\EventAttendanceController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ArchiveController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\FeedbackController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\EventExpenseController;
use App\Http\Controllers\IntegrationController;
use App\Http\Controllers\AgeBracketController;
use App\Http\Controllers\CivilStatusController;
use App\Http\Controllers\NameSuffixController;
use App\Http\Controllers\CurrentStatusController;
use App\Http\Controllers\HouseholdController;
use App\Http\Controllers\StaffAccountController;
use App\Http\Middleware\EnsureHeadStaff;
use App\Http\Middleware\EnsureStaff;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\SessionGuard;

/*
|--------------------------------------------------------------------------
| FRONTEND / REACT SPA
|--------------------------------------------------------------------------
*/

Route::get('/', function () {
    return view('app');
})->middleware(SecurityHeaders::class);

/*
|--------------------------------------------------------------------------
| PUBLIC ROUTES
|--------------------------------------------------------------------------
*/

// Two layers: a coarse per-IP brake here (the 'login' limiter) and a precise
// per-account lockout inside UserController::login() (5 wrong tries per
// account+network in 15 minutes, and 10 per account overall).
Route::post('/login', [UserController::class, 'login'])->middleware(['throttle:login', SecurityHeaders::class])->name('login');

// Head Staff break-glass: reset the password with a printed recovery code.
Route::post('/recover-head-access', [StaffAccountController::class, 'recoverHeadAccess'])->middleware(['throttle:login', SecurityHeaders::class]);

/*
|--------------------------------------------------------------------------
| PUBLIC WEBHOOK (Facebook Page — "2 in 1" adviser recommendation)
|--------------------------------------------------------------------------
*/
Route::get('/integrations/facebook/webhook', [IntegrationController::class, 'webhookVerify']);
Route::post('/integrations/facebook/webhook', [IntegrationController::class, 'webhookReceive']);

/*
|--------------------------------------------------------------------------
| CONTENT TRANSLATIONS (UC-17) -- PUBLIC on purpose
|--------------------------------------------------------------------------
| The React app fetches this once on every page load, including the login
| screen where nobody is signed in yet. Behind auth it answered 401 to
| guests, and the API client's 401 handler bounced them back to "/", so the
| login page reloaded forever behind the splash screen. It only returns the
| translated label text, nothing user-specific.
*/
Route::get('/content-translations', function () {
    try {
        $rows = \App\Models\ContentTranslation::all();
    } catch (\Throwable $e) {
        // Table not migrated yet -- the app simply falls back to English.
        return response()->json((object) []);
    }
    $map = [];
    foreach ($rows as $r) {
        $map[$r->key][$r->locale] = $r->value;
    }
    return response()->json((object) $map);
});

/*
|--------------------------------------------------------------------------
| PROTECTED ROUTES
|--------------------------------------------------------------------------
*/

Route::middleware(['auth', SessionGuard::class, SecurityHeaders::class])->group(function () {

    /*
    |--------------------------------------------------------------------------
    | AUTH
    |--------------------------------------------------------------------------
    */
    Route::post('/logout', [UserController::class, 'logout']);
    Route::get('/me', [UserController::class, 'me']);
    Route::get('/barangay-officials', [\App\Http\Controllers\BarangayOfficialController::class, 'index']);
    Route::patch('/users/{id}/change-password', [UserController::class, 'changePassword'])->middleware('throttle:sensitive');

    /*
    |--------------------------------------------------------------------------
    | USERS
    |--------------------------------------------------------------------------
    */
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/all-for-memberships', [UserController::class, 'getAllForMemberships']);
    Route::get('/users/{id}', [UserController::class, 'show']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);
    Route::post('/users/{id}/restore', [UserController::class, 'restore']);
    // (permanent delete routes removed on purpose -- records are archived and kept)
    Route::patch('/users/{id}/contact-number', [UserController::class, 'updateContactNumber']);

    /*
    |--------------------------------------------------------------------------
    | USER MEMBERSHIPS
    |--------------------------------------------------------------------------
    */
    Route::put('/users/{id}/memberships', [UserController::class, 'updateMemberships']);
    Route::delete('/users/{id}/memberships', [UserController::class, 'removeMemberships']);

    /*
    |--------------------------------------------------------------------------
    | PROFILING SETTINGS -- Adviser example (Senior Citizen eligibility)
    | extended to Youth / Solo Parent: Staff-configurable age brackets and
    | civil/current statuses used to gate membership eligibility.
    |--------------------------------------------------------------------------
    */
    Route::get('/age-brackets', [AgeBracketController::class, 'index']);
    Route::post('/age-brackets', [AgeBracketController::class, 'store']);
    Route::put('/age-brackets/{id}', [AgeBracketController::class, 'update']);
    Route::delete('/age-brackets/{id}', [AgeBracketController::class, 'destroy']);
    Route::post('/age-brackets/{id}/restore', [AgeBracketController::class, 'restore']);

    // Name suffixes (Jr., Sr., II ...) offered in the resident forms.
    Route::get('/name-suffixes', [NameSuffixController::class, 'index']);
    Route::post('/name-suffixes', [NameSuffixController::class, 'store']);
    Route::delete('/name-suffixes/{id}', [NameSuffixController::class, 'destroy']);

    Route::get('/civil-statuses', [CivilStatusController::class, 'index']);
    Route::post('/civil-statuses', [CivilStatusController::class, 'store']);
    Route::put('/civil-statuses/{id}', [CivilStatusController::class, 'update']);
    Route::delete('/civil-statuses/{id}', [CivilStatusController::class, 'destroy']);
    Route::post('/civil-statuses/{id}/restore', [CivilStatusController::class, 'restore']);

    Route::get('/current-statuses', [CurrentStatusController::class, 'index']);
    Route::post('/current-statuses', [CurrentStatusController::class, 'store']);
    Route::put('/current-statuses/{id}', [CurrentStatusController::class, 'update']);
    Route::delete('/current-statuses/{id}', [CurrentStatusController::class, 'destroy']);
    Route::post('/current-statuses/{id}/restore', [CurrentStatusController::class, 'restore']);

    /*
    |--------------------------------------------------------------------------
    | HOUSEHOLDS -- real relational replacement for the old free-text
    | household_code string matching on users.
    |--------------------------------------------------------------------------
    */
    Route::get('/households', [HouseholdController::class, 'index']);
    Route::get('/households/unassigned', [HouseholdController::class, 'unassigned']);
    Route::get('/households/options', [HouseholdController::class, 'options']);
    Route::get('/households/alerts', [HouseholdController::class, 'alerts']);
    Route::get('/households/{id}', [HouseholdController::class, 'show']);
    Route::post('/households', [HouseholdController::class, 'store']);
    Route::put('/households/{id}', [HouseholdController::class, 'update']);
    Route::delete('/households/{id}', [HouseholdController::class, 'destroy']);
    Route::post('/households/{id}/members', [HouseholdController::class, 'addMember']);
    Route::delete('/households/{id}/members/{userId}', [HouseholdController::class, 'removeMember']);
    Route::put('/households/{id}/head', [HouseholdController::class, 'setHead']);

    /*
    |--------------------------------------------------------------------------
    | MEMBERSHIPS
    |--------------------------------------------------------------------------
    */
    Route::resource('api/memberships', MembershipController::class);
    Route::get('/memberships/{id}/ineligible-members', [MembershipController::class, 'ineligibleMembers']);
    Route::post('/memberships/{id}/restore', [MembershipController::class, 'restore']);

    /*
    |--------------------------------------------------------------------------
    | MEMBERSHIP RESIDENTS
    |--------------------------------------------------------------------------
    */
    Route::get('/membership-residents', [MembershipResidentController::class, 'index']);
    Route::post('/membership-residents/export/pdf', [\App\Http\Controllers\ResidentExportController::class, 'pdf']);
    Route::get('/membership-residents/{id}', [MembershipResidentController::class, 'show']);
    Route::post('/membership-residents', [MembershipResidentController::class, 'store']);
    Route::put('/membership-residents/{id}', [MembershipResidentController::class, 'update']);
    Route::delete('/membership-residents/{id}', [MembershipResidentController::class, 'destroy']);

    /*
    |--------------------------------------------------------------------------
    | EVENTS (WITH SOFT DELETE SUPPORT)
    |--------------------------------------------------------------------------
    */
    Route::get('/events-data', [EventController::class, 'data']);
    Route::get('/events/overdue-borrows', [EventController::class, 'overdueBorrows']);
    // Declared before the /events/{id} routes below (same reason as
    // overdue-borrows above) so "borrowed-items" is never swallowed as an
    // {id} value.
    Route::get('/events/borrowed-items/releases/recent', [EventController::class, 'recentReleases']);
    Route::post('/events/borrowed-items/releases/{releaseId}/undo', [EventController::class, 'undoRelease']);
    Route::post('/events/borrowed-items/releases/{releaseId}/update', [EventController::class, 'updateRelease']);
    Route::get('/events/borrowed-items/undos/recent', [EventController::class, 'recentUndos']);
    Route::post('/events', [EventController::class, 'store']);
    Route::put('/events/{id}', [EventController::class, 'update']);
    Route::delete('/events/{id}', [EventController::class, 'destroy']);  // Now soft deletes
    Route::get('/events/{id}', [EventController::class, 'show']);
    Route::get('/events/{id}/inventory', [EventController::class, 'eventInventory']);

    // 🆕 SOFT DELETE ROUTES (ADDED)
    Route::post('/events/{id}/restore', [EventController::class, 'restore']);        // Restore soft-deleted event
    Route::post('/events/{id}/release-borrowed-items', [EventController::class, 'returnBorrowedItems']);
    Route::post('/events/{eventId}/borrowed-items/{borrowId}/release', [EventController::class, 'releaseBorrowedItem']);

    /*
    |--------------------------------------------------------------------------
    | ATTENDANCE
    |--------------------------------------------------------------------------
    */
    Route::prefix('attendance')->group(function () {
        Route::post('/time-in', [EventAttendanceController::class, 'timeIn']);
        Route::put('/time-out', [EventAttendanceController::class, 'timeOut']);
        Route::get('/{userId}', [EventAttendanceController::class, 'getMemberHistory']);
    });

    /*
    |--------------------------------------------------------------------------
    | DASHBOARD QUERIES
    |--------------------------------------------------------------------------
    */
    Route::get('/events/{id}/attendances', [EventAttendanceController::class, 'getEventAttendees']);
    Route::get('/users/{id}/attendances', [EventAttendanceController::class, 'getMemberHistory']);

    /*
    |--------------------------------------------------------------------------
    | ACTIVITY LOGS
    |--------------------------------------------------------------------------
    */
    Route::get('/activity-logs', [ActivityLogController::class, 'index'])->middleware(EnsureStaff::class);
    Route::get('/activity-logs/today', [ActivityLogController::class, 'today'])->middleware(EnsureStaff::class);
    Route::get('/activity-logs/{id}', [ActivityLogController::class, 'show'])->middleware(EnsureStaff::class);

    /*
    |--------------------------------------------------------------------------
    | NOTIFICATIONS
    |--------------------------------------------------------------------------
    */
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/staff', [NotificationController::class, 'staffNotifications']);
    Route::get('/staff/alerts', [NotificationController::class, 'staffAlerts']);
    Route::get('/staff/alerts/all', [NotificationController::class, 'staffAlertsAll']);
    Route::put('/staff/alerts/read-all', [NotificationController::class, 'markAllStaffAlertsRead']);
    Route::put('/staff/alerts/{id}/read', [NotificationController::class, 'markStaffAlertRead']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::get('/notifications/replies', [NotificationController::class, 'replyAlerts']);
    Route::put('/notifications/replies-read', [NotificationController::class, 'markReplyAlertsRead']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::put('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::get('/notifications/this-week', [NotificationController::class, 'thisWeek']);
    Route::get('/notifications/sms-logs', [NotificationController::class, 'smsLogs']);

    /*
    |--------------------------------------------------------------------------
    | ARCHIVE / TRASH
    |--------------------------------------------------------------------------
    */
    Route::get('/api/archived', [ArchiveController::class, 'index'])->middleware(EnsureStaff::class);
    Route::post('api/archive/restore', [ArchiveController::class, 'restore'])->middleware(EnsureStaff::class);

    /*
    |--------------------------------------------------------------------------
    | REPORTS & ANALYTICS (adviser: "Filtering — Date, Summary — Attendance, %")
    |--------------------------------------------------------------------------
    */
    Route::get('/reports/attendance-summary', [ReportController::class, 'attendanceSummary'])->middleware(EnsureStaff::class);
    Route::get('/reports/membership-summary', [ReportController::class, 'membershipSummary'])->middleware(EnsureStaff::class);
    Route::get('/reports/budget-summary', [ReportController::class, 'budgetSummary'])->middleware(EnsureStaff::class);
    Route::get('/reports/inventory-summary', [ReportController::class, 'inventorySummary'])->middleware(EnsureStaff::class);
    // Official-record downloads (always English -- see ReportController::buildExportPayload)
    Route::get('/reports/export/pdf', [ReportController::class, 'exportPdf'])->middleware(EnsureStaff::class);
    Route::get('/reports/export/html', [ReportController::class, 'exportHtml'])->middleware(EnsureStaff::class);
    Route::get('/reports/export/word', [ReportController::class, 'exportWord'])->middleware(EnsureStaff::class);
    Route::get('/reports/export/csv', [ReportController::class, 'exportCsv'])->middleware(EnsureStaff::class);
    // Live page + Report History
    Route::get('/reports/pulse', [ReportController::class, 'pulse'])->middleware(EnsureStaff::class);
    Route::get('/reports/history', [ReportController::class, 'history'])->middleware(EnsureStaff::class);
    Route::post('/reports/history', [ReportController::class, 'recordPrint'])->middleware(EnsureStaff::class);

   /*
    |--------------------------------------------------------------------------
    | FEEDBACK (UC-16)
    |--------------------------------------------------------------------------
    */

// Submit (first time) OR edit (same handler — the controller decides by
// whether the resident already has a row for that event). Both paths
// enforce the 12h submit / 20m edit window from the row's FROZEN values
// (see FeedbackController::store() and Feedback::isEditLocked()).
Route::post('/feedback', [FeedbackController::class, 'store']);

// RESTful edit alias — same handler as POST /feedback above. Kept so a
// PUT /feedback/{id} request from the client doesn't fall through to the
// SPA catch-all.
Route::put('/feedback/{id}', [FeedbackController::class, 'store']);

// Remove the resident's own feedback (soft delete + activity log).
// Returns 403 with code 'edit_window_closed' once the frozen 20m
// edit window has passed.
Route::delete('/feedback/{id}', [FeedbackController::class, 'destroy']);

// Member reads
Route::get('/feedback/pending', [FeedbackController::class, 'pending']);
Route::get('/feedback/mine', [FeedbackController::class, 'mine']);
Route::get('/feedback/event/{eventId}', [FeedbackController::class, 'forEvent']);

// Feedback rules: everyone reads them, only Head Staff changes them.
Route::get('/settings/feedback-rules', [FeedbackController::class, 'rules']);
Route::put('/settings/feedback-rules', [FeedbackController::class, 'updateRules'])
    ->middleware([EnsureHeadStaff::class, 'throttle:sensitive']);

// Edit history of one rating / absence reason (staff OR the author).
Route::get('/feedback/{kind}/{id}/history', [FeedbackController::class, 'history'])
    ->whereIn('kind', ['rating', 'absence']);

// Non-attendance reasons (same 20-minute rule)
Route::post('/feedback/absence', [FeedbackController::class, 'storeAbsence'])
    ->middleware('throttle:30,1');
Route::get('/feedback/absence/mine', [FeedbackController::class, 'mineAbsences']);
Route::get('/feedback/absence/event/{eventId}', [FeedbackController::class, 'absencesForEvent']);

// Staff response layer (heart / reply / member like-reply) — does NOT
// touch the resident's rating/comment; only the reply columns.
Route::put('/feedback/{kind}/{id}/like', [FeedbackController::class, 'like'])
    ->whereIn('kind', ['rating', 'absence'])
    ->middleware(EnsureStaff::class);
Route::put('/feedback/{kind}/{id}/reply-like', [FeedbackController::class, 'likeReply'])
    ->whereIn('kind', ['rating', 'absence'])
    ->middleware('throttle:60,1');
Route::put('/feedback/{kind}/{id}/reply', [FeedbackController::class, 'reply'])
    ->whereIn('kind', ['rating', 'absence'])
    ->middleware([EnsureStaff::class, 'throttle:60,1']);
    
    /*
    |--------------------------------------------------------------------------
    | BUDGET & EXPENSES (UC-8)
    |--------------------------------------------------------------------------
    */
    Route::get('/events/{eventId}/expenses', [EventExpenseController::class, 'index'])->middleware(EnsureStaff::class);
    Route::post('/events/{eventId}/expenses', [EventExpenseController::class, 'store'])->middleware(EnsureStaff::class);
    Route::put('/events/{eventId}/budget', [EventExpenseController::class, 'updateBudget'])->middleware(EnsureStaff::class);
    Route::put('/events/{eventId}/expenses/{expenseId}', [EventExpenseController::class, 'update'])->middleware(EnsureStaff::class);
    Route::delete('/events/{eventId}/expenses/{expenseId}', [EventExpenseController::class, 'destroy'])->middleware(EnsureStaff::class);

    /*
    |--------------------------------------------------------------------------
    | INVENTORY (UC-9)
    |--------------------------------------------------------------------------
    */
    Route::get('/inventory', [InventoryController::class, 'index'])->middleware(EnsureStaff::class);
    Route::get('/inventory/borrowable', [InventoryController::class, 'borrowable'])->middleware(EnsureStaff::class);
    Route::post('/inventory', [InventoryController::class, 'store'])->middleware(EnsureStaff::class);
    Route::put('/inventory/{id}', [InventoryController::class, 'update'])->middleware(EnsureStaff::class);
    Route::delete('/inventory/{id}', [InventoryController::class, 'destroy'])->middleware(EnsureStaff::class);

    /*
    |--------------------------------------------------------------------------
    | INTEGRATIONS (adviser: "2 in 1 — Facebook Page")
    |--------------------------------------------------------------------------
    */
    Route::get('/integrations/facebook', [IntegrationController::class, 'facebookStatus']);
    Route::post('/integrations/facebook', [IntegrationController::class, 'connectFacebook']);
    Route::delete('/integrations/facebook', [IntegrationController::class, 'disconnectFacebook']);

    /*
    |--------------------------------------------------------------------------
    | ACCOUNT SECURITY
    |--------------------------------------------------------------------------
    */
    // Browser pings this while someone is really using the page (keeps a staff
    // session alive; background polling does not).
    Route::post('/session/keepalive', [StaffAccountController::class, 'keepAlive']);

    // Any staff member: own alerts, own two-step login, accepting a transfer.
    Route::middleware(EnsureStaff::class)->group(function () {
        Route::get('/security/alerts', [StaffAccountController::class, 'alerts']);
        Route::post('/security/alerts/read-all', [StaffAccountController::class, 'markAllAlertsRead']);
        Route::post('/security/alerts/{id}/read', [StaffAccountController::class, 'markAlertRead']);

        Route::middleware('throttle:sensitive')->group(function () {
            Route::post('/two-factor/setup', [StaffAccountController::class, 'twoFactorSetup']);
            Route::post('/two-factor/confirm', [StaffAccountController::class, 'twoFactorConfirm']);
            Route::post('/two-factor/disable', [StaffAccountController::class, 'twoFactorDisable']);
            Route::post('/staff/head-transfer/accept', [StaffAccountController::class, 'acceptTransfer']);
        });
        Route::get('/staff/head-transfer', [StaffAccountController::class, 'myTransfer']);
    });

    // Head Staff only. Each action also re-asks for the caller's password.
    Route::middleware(EnsureHeadStaff::class)->prefix('staff-accounts')->group(function () {
        Route::get('/', [StaffAccountController::class, 'index']);
        Route::get('/candidates', [StaffAccountController::class, 'candidates']);

        // Changes are rate-limited (10/min per person) on top of the password re-check.
        Route::middleware('throttle:sensitive')->group(function () {
            Route::post('/promote', [StaffAccountController::class, 'promote']);
            Route::post('/{id}/demote', [StaffAccountController::class, 'demote']);
            Route::post('/{id}/suspend', [StaffAccountController::class, 'suspend']);
            Route::post('/{id}/unsuspend', [StaffAccountController::class, 'unsuspend']);
            Route::post('/{id}/sign-out', [StaffAccountController::class, 'signOut']);
            Route::post('/{id}/reset-password', [StaffAccountController::class, 'resetPassword']);
            Route::post('/transfer', [StaffAccountController::class, 'startTransfer']);
            Route::post('/transfer/cancel', [StaffAccountController::class, 'cancelTransfer']);
            Route::post('/recovery-codes', [StaffAccountController::class, 'regenerateRecoveryCodes']);
        });
    });
});

/*
|--------------------------------------------------------------------------
| REACT SPA FALLBACK - IMPORTANT FOR REACT ROUTING
|--------------------------------------------------------------------------
*/

Route::get('/{path?}', function () {
    return view('app');
})->where('path', '^(?!api).*$');

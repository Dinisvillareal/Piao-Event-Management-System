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
use App\Http\Controllers\CurrentStatusController;
use App\Http\Controllers\HouseholdController;

/*
|--------------------------------------------------------------------------
| FRONTEND / REACT SPA
|--------------------------------------------------------------------------
*/

Route::get('/', function () {
    return view('app');
});

/*
|--------------------------------------------------------------------------
| PUBLIC ROUTES
|--------------------------------------------------------------------------
*/

Route::post('/login', [UserController::class, 'login'])->name('login');

/*
|--------------------------------------------------------------------------
| PUBLIC WEBHOOK (Facebook Page — "2 in 1" adviser recommendation)
|--------------------------------------------------------------------------
*/
Route::get('/integrations/facebook/webhook', [IntegrationController::class, 'webhookVerify']);
Route::post('/integrations/facebook/webhook', [IntegrationController::class, 'webhookReceive']);

/*
|--------------------------------------------------------------------------
| PROTECTED ROUTES
|--------------------------------------------------------------------------
*/

Route::middleware('auth')->group(function () {

    /*
    |--------------------------------------------------------------------------
    | AUTH
    |--------------------------------------------------------------------------
    */
    Route::post('/logout', [UserController::class, 'logout']);
    Route::get('/me', [UserController::class, 'me']);
    Route::patch('/users/{id}/change-password', [UserController::class, 'changePassword']);

    /*
    |--------------------------------------------------------------------------
    | USERS
    |--------------------------------------------------------------------------
    */
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/all-for-memberships', [UserController::class, 'getAllForMemberships']);
    Route::get('/users/staff', [UserController::class, 'staff']);
    Route::get('/users/resident', [UserController::class, 'resident']);
    Route::get('/users/deleted', [UserController::class, 'deletedUsers']);
    Route::get('/users/{id}', [UserController::class, 'show']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);
    Route::post('/users/{id}/restore', [UserController::class, 'restore']);
    Route::delete('/users/{id}/force-delete', [UserController::class, 'forceDelete']);
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
    Route::post('/events', [EventController::class, 'store']);
    Route::put('/events/{id}', [EventController::class, 'update']);
    Route::delete('/events/{id}', [EventController::class, 'destroy']);  // Now soft deletes
    Route::get('/events/{id}', [EventController::class, 'show']);
    
    // 🆕 SOFT DELETE ROUTES (ADDED)
    Route::post('/events/{id}/restore', [EventController::class, 'restore']);        // Restore soft-deleted event
    Route::post('/events/{id}/release-borrowed-items', [EventController::class, 'returnBorrowedItems']);
    Route::post('/events/{eventId}/borrowed-items/{borrowId}/release', [EventController::class, 'releaseBorrowedItem']);
    Route::delete('/events/{id}/force-delete', [EventController::class, 'forceDelete']); // Permanently delete

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
    Route::get('/activity-logs', [ActivityLogController::class, 'index']);
    Route::get('/activity-logs/today', [ActivityLogController::class, 'today']);
    Route::get('/activity-logs/{id}', [ActivityLogController::class, 'show']);

    /*
    |--------------------------------------------------------------------------
    | NOTIFICATIONS
    |--------------------------------------------------------------------------
    */
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/staff', [NotificationController::class, 'staffNotifications']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::put('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::get('/notifications/this-week', [NotificationController::class, 'thisWeek']);
    Route::get('/notifications/sms-logs', [NotificationController::class, 'smsLogs']);

    /*
    |--------------------------------------------------------------------------
    | ARCHIVE / TRASH
    |--------------------------------------------------------------------------
    */
    Route::get('/api/archived', [ArchiveController::class, 'index']);
    Route::post('api/archive/restore', [ArchiveController::class, 'restore']);
    Route::delete('api/archive/force-delete', [ArchiveController::class, 'forceDelete']);

    /*
    |--------------------------------------------------------------------------
    | REPORTS & ANALYTICS (adviser: "Filtering — Date, Summary — Attendance, %")
    |--------------------------------------------------------------------------
    */
    Route::get('/reports/attendance-summary', [ReportController::class, 'attendanceSummary']);
    Route::get('/reports/membership-summary', [ReportController::class, 'membershipSummary']);
    Route::get('/reports/budget-summary', [ReportController::class, 'budgetSummary']);
    Route::get('/reports/inventory-summary', [ReportController::class, 'inventorySummary']);

    /*
    |--------------------------------------------------------------------------
    | FEEDBACK (UC-16)
    |--------------------------------------------------------------------------
    */
    Route::post('/feedback', [FeedbackController::class, 'store']);
    Route::get('/feedback/pending', [FeedbackController::class, 'pending']);
    Route::get('/feedback/mine', [FeedbackController::class, 'mine']);
    Route::get('/feedback/event/{eventId}', [FeedbackController::class, 'forEvent']);

    /*
    |--------------------------------------------------------------------------
    | BUDGET & EXPENSES (UC-8)
    |--------------------------------------------------------------------------
    */
    Route::get('/events/{eventId}/expenses', [EventExpenseController::class, 'index']);
    Route::post('/events/{eventId}/expenses', [EventExpenseController::class, 'store']);
    Route::put('/events/{eventId}/expenses/{expenseId}', [EventExpenseController::class, 'update']);
    Route::delete('/events/{eventId}/expenses/{expenseId}', [EventExpenseController::class, 'destroy']);

    /*
    |--------------------------------------------------------------------------
    | INVENTORY (UC-9)
    |--------------------------------------------------------------------------
    */
    Route::get('/inventory', [InventoryController::class, 'index']);
    Route::get('/inventory/borrowable', [InventoryController::class, 'borrowable']);
    Route::post('/inventory', [InventoryController::class, 'store']);
    Route::put('/inventory/{id}', [InventoryController::class, 'update']);
    Route::delete('/inventory/{id}', [InventoryController::class, 'destroy']);

    /*
    |--------------------------------------------------------------------------
    | INTEGRATIONS (adviser: "2 in 1 — Facebook Page")
    |--------------------------------------------------------------------------
    */
    Route::get('/integrations/facebook', [IntegrationController::class, 'facebookStatus']);
    Route::post('/integrations/facebook', [IntegrationController::class, 'connectFacebook']);
    Route::delete('/integrations/facebook', [IntegrationController::class, 'disconnectFacebook']);
});

/*
|--------------------------------------------------------------------------
| REACT SPA FALLBACK - IMPORTANT FOR REACT ROUTING
|--------------------------------------------------------------------------
*/

Route::get('/{path?}', function () {
    return view('app');
})->where('path', '^(?!api).*$');
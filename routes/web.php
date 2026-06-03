<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

use App\Models\Event;

use App\Http\Controllers\UserController;
use App\Http\Controllers\MembershipController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\MembershipResidentController;
use App\Http\Controllers\EventAttendanceController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\NotificationController;

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

Route::post('/login', [UserController::class, 'login'])
    ->name('login');

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
    Route::post('/change-password', [UserController::class, 'changePassword']);

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

    /*
    |--------------------------------------------------------------------------
    | USER MEMBERSHIPS
    |--------------------------------------------------------------------------
    */
    Route::put('/users/{id}/memberships', [UserController::class, 'updateMemberships']);
    Route::delete('/users/{id}/memberships', [UserController::class, 'removeMemberships']);

    /*
    |--------------------------------------------------------------------------
    | MEMBERSHIPS
    |--------------------------------------------------------------------------
    */
    Route::resource('api/memberships', MembershipController::class);

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
    | EVENTS
    |--------------------------------------------------------------------------
    */
    //Route::get('/events', [EventController::class, 'index']);
    Route::get('/events-data', [EventController::class, 'data']);
    Route::post('/events', [EventController::class, 'store']);
    Route::put('/events/{id}', [EventController::class, 'update']);
    Route::delete('/events/{id}', [EventController::class, 'destroy']);
    Route::get('/events/{id}', [EventController::class, 'show']);

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
    | ✅ FIX: ACTIVITY LOGS (MOVE INSIDE AUTH CORRECTLY)
    |--------------------------------------------------------------------------
    */
    Route::get('/activity-logs', [ActivityLogController::class, 'index']);
    Route::get('/activity-logs/{id}', [ActivityLogController::class, 'show']);

    /* --------------------------------------------------------------------------
    | NOTIFICATIONS
    |-------------------------------------------------------------------------- */
   Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/staff', [NotificationController::class, 'staffNotifications']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::put('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
});

/*
|--------------------------------------------------------------------------
| REACT SPA FALLBACK
|--------------------------------------------------------------------------
*/
Route::get('/{path?}', function () {
    return view('app');
})->where('path', '^(?!api).*$');

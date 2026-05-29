<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;
use App\Http\Controllers\MembershipController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\MembershipResidentController;
use App\Http\Controllers\EventAttendanceController;
use App\Models\Event;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
*/

Route::get('/', function () {
    return view('app');
});

/*
|--------------------------------------------------------------------------
| PUBLIC
|--------------------------------------------------------------------------
*/

Route::post('/login', [UserController::class, 'login']);

/*
|--------------------------------------------------------------------------
| AUTH ROUTES
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

    Route::get('/users/all-for-memberships',
        [UserController::class, 'getAllForMemberships']);

    Route::get('/users/{id}',
        [UserController::class, 'show']);

    Route::post('/users',
        [UserController::class, 'store']);

    Route::put('/users/{id}',
        [UserController::class, 'update']);

    Route::delete('/users/{id}',
        [UserController::class, 'destroy']);

    Route::post('/users/{id}/restore',
        [UserController::class, 'restore']);

    Route::delete('/users/{id}/force-delete',
        [UserController::class, 'forceDelete']);

    /*
    |--------------------------------------------------------------------------
    | MEMBERSHIPS ONLY
    |--------------------------------------------------------------------------
    */

    Route::put('/users/{id}/memberships',
        [UserController::class, 'updateMemberships']);

    Route::delete('/users/{id}/memberships',
        [UserController::class, 'removeMemberships']);

    /*
    |--------------------------------------------------------------------------
    | MEMBERSHIP QUERIES
    |--------------------------------------------------------------------------
    */

    Route::get('/membership-residents',
        [MembershipResidentController::class, 'index']);

    Route::get('/membership-residents/{id}',
        [MembershipResidentController::class, 'show']);

    Route::get('/membership-residents/{id}/memberships',
        [MembershipResidentController::class, 'getUserMembershipsPaginated']);

    /*
    |--------------------------------------------------------------------------
    | MEMBERSHIPS
    |--------------------------------------------------------------------------
    */

    Route::resource('api/memberships',
        MembershipController::class);

    /*
    |--------------------------------------------------------------------------
    | EVENTS
    |--------------------------------------------------------------------------
    */

    Route::get('/events-data', function () {

        $user = Auth::user();

        $membershipIds = DB::table('membership_residents')
            ->where('user_id', $user->id)
            ->pluck('membership_id');

        $events = Event::whereIn('membership_id', $membershipIds)
            ->orWhereNull('membership_id')
            ->get();

        return response()->json([
            'data' => $events
        ]);
    });

    Route::post('/events',
        [EventController::class, 'store']);

    Route::put('/events/{id}',
        [EventController::class, 'update']);

    Route::delete('/events/{id}',
        [EventController::class, 'destroy']);

    Route::get('/events/{id}',
        [EventController::class, 'show']);

    /*
    |--------------------------------------------------------------------------
    | ATTENDANCE
    |--------------------------------------------------------------------------
    */

    Route::prefix('attendance')->group(function () {

        Route::post('/time-in',
            [EventAttendanceController::class, 'timeIn']);

        Route::put('/time-out',
            [EventAttendanceController::class, 'timeOut']);

        Route::get('/{userId}',
            [EventAttendanceController::class, 'getMemberHistory']);
    });

    Route::get('/events/{id}/attendances',
        [EventAttendanceController::class, 'getEventAttendees']);

    Route::get('/users/{id}/attendances',
        [EventAttendanceController::class, 'getMemberHistory']);
});

/*
|--------------------------------------------------------------------------
| REACT SPA
|--------------------------------------------------------------------------
*/

Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');

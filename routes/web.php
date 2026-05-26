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
| FRONTEND VIEWS - REACT ONLY
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
| PROTECTED ROUTES
|--------------------------------------------------------------------------
*/

Route::middleware('auth')->group(function () {

    /*
    |------------------------
    | AUTH
    |------------------------
    */
    Route::post('/logout', [UserController::class, 'logout']);
    Route::get('/me', [UserController::class, 'me']);
    Route::post('/change-password', [UserController::class, 'changePassword']);

    /*
    |------------------------
    | USERS
    |------------------------
    */
    Route::get('/users/all-for-memberships', [UserController::class, 'getAllForMemberships']);
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/{id}', [UserController::class, 'show']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);
    Route::get('/users/staff', [UserController::class, 'staff']);
    Route::get('/users/resident', [UserController::class, 'resident']);
    Route::get('/users/deleted', [UserController::class, 'deletedUsers']);
    Route::post('/users/{id}/restore', [UserController::class, 'restore']);
    Route::delete('/users/{id}/force-delete', [UserController::class, 'forceDelete']);

    /*
    |------------------------
    | MEMBERSHIPS
    |------------------------
    */
    Route::resource('api/memberships', MembershipController::class);
    Route::prefix('api/memberships')->group(function () {
        Route::get('/paginated', [MembershipController::class, 'getPaginated']);
        Route::get('/simple', [MembershipController::class, 'getSimplePaginated']);
        Route::get('/cursor', [MembershipController::class, 'getCursorPaginated']);
        Route::get('/search', [MembershipController::class, 'searchPaginated']);
        Route::get('/sort', [MembershipController::class, 'sortPaginated']);
    });

    /*
    |------------------------
    | MEMBERSHIP RESIDENTS
    |------------------------
    */
    Route::get('/membership-residents', [MembershipResidentController::class, 'index']);
    Route::get('/membership-residents/{id}', [MembershipResidentController::class, 'show']);
    Route::get('/membership-residents/{id}/memberships', [MembershipResidentController::class, 'getUserMembershipsPaginated']);
    Route::post('/membership-residents', [MembershipResidentController::class, 'store']);
    Route::put('/membership-residents/{id}', [MembershipResidentController::class, 'update']);
    Route::delete('/membership-residents/{id}', [MembershipResidentController::class, 'destroy']);

    /*
    |------------------------
    | EVENTS
    |------------------------
    */
    Route::get('/events-data', function () {
        $user = Auth::user();
        $membershipIds = DB::table('membership_residents')
            ->where('user_id', $user->id)
            ->pluck('membership_id');
        $events = Event::whereIn('membership_id', $membershipIds)
            ->orWhereNull('membership_id')
            ->get();
        return response()->json(['data' => $events]);
    });
    
    Route::post('/events', [EventController::class, 'store']);
    Route::put('/events/{id}', [EventController::class, 'update']);
    Route::delete('/events/{id}', [EventController::class, 'destroy']);
    Route::get('/events/{id}', [EventController::class, 'show']);

    /*
    |------------------------
    | ATTENDANCE
    |------------------------
    */
    Route::prefix('attendance')->group(function () {
        Route::post('/time-in', [EventAttendanceController::class, 'timeIn']);
        Route::put('/time-out', [EventAttendanceController::class, 'timeOut']);
        Route::get('/{userId}', [EventAttendanceController::class, 'getMemberHistory']);
    });

    /*
    |------------------------
    | DASHBOARD QUERIES
    |------------------------
    */
    Route::get('/events/{id}/attendances', [EventAttendanceController::class, 'getEventAttendees']);
    Route::get('/users/{id}/attendances', [EventAttendanceController::class, 'getMemberHistory']);
});

// ✅✅✅ MOVED TO THE VERY BOTTOM - This is CRITICAL!
// All API routes must be defined BEFORE this wildcard
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');
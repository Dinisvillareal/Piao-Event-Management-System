<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;
use App\Http\Controllers\MembershipController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\MembershipResidentController;
use App\Http\Controllers\EventAttendanceController;

/*
|--------------------------------------------------------------------------
| FRONTEND VIEWS - REACT ONLY
|--------------------------------------------------------------------------
*/

Route::get('/', function () {
    return view('app');
});

Route::get('/{any}', function () {
    return view('app');
})->where('any', 'dashboard|qr|attendance|events|notify|settings|staff');

/*
|--------------------------------------------------------------------------
| PUBLIC ROUTES (No authentication required)
|--------------------------------------------------------------------------
*/

Route::post('/login', [UserController::class, 'login']);

/*
|--------------------------------------------------------------------------
| PROTECTED ROUTES (Authentication required)
|--------------------------------------------------------------------------
*/

Route::middleware('auth')->group(function () {

    // AUTH
    Route::post('/logout', [UserController::class, 'logout']);
    Route::get('/me', [UserController::class, 'me']);

    // USERS CRUD
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/{id}', [UserController::class, 'show']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);

    // ROLE FILTERS
    Route::get('/users-staff', [UserController::class, 'staff']);
    Route::get('/users-member', [UserController::class, 'member']);
    Route::get('/users/staff', [UserController::class, 'staff']);
    Route::get('/users/member', [UserController::class, 'member']);

    // MEMBERSHIPS ROUTES
    Route::resource('memberships', MembershipController::class);

    Route::prefix('memberships')->group(function () {
        Route::get('/paginated', [MembershipController::class, 'getPaginated']);
        Route::get('/simple', [MembershipController::class, 'getSimplePaginated']);
        Route::get('/cursor', [MembershipController::class, 'getCursorPaginated']);
        Route::get('/search', [MembershipController::class, 'searchPaginated']);
        Route::get('/sort', [MembershipController::class, 'sortPaginated']);
    });

    // MEMBERSHIP RESIDENTS ROUTES
    Route::get('/membership-residents', [MembershipResidentController::class, 'index']);
    Route::get('/membership-residents/{id}', [MembershipResidentController::class, 'show']);
    Route::get('/membership-residents/{id}/memberships', [MembershipResidentController::class, 'getUserMembershipsPaginated']);
    Route::post('/membership-residents', [MembershipResidentController::class, 'store']);
    Route::put('/membership-residents/{id}', [MembershipResidentController::class, 'update']);
    Route::delete('/membership-residents/{id}', [MembershipResidentController::class, 'destroy']);

    // EVENTS ROUTES
    Route::prefix('events')->group(function () {
        Route::get('/', [EventController::class, 'index'])->name('events.index');
        Route::get('/{id}', [EventController::class, 'show'])->name('events.show');
        Route::post('/', [EventController::class, 'store'])->name('events.store');
        Route::put('/{id}', [EventController::class, 'update'])->name('events.update');
        Route::delete('/{id}', [EventController::class, 'destroy'])->name('events.destroy');
    });

    // EVENT ATTENDANCE ROUTES
    Route::prefix('attendance')->group(function () {
        Route::post('/time-in', [EventAttendanceController::class, 'timeIn']);
        Route::put('/time-out', [EventAttendanceController::class, 'timeOut']);
    });

    // FETCHING LISTS FOR DASHBOARDS
    Route::get('/events/{id}/attendances', [EventAttendanceController::class, 'getEventAttendees']);
    Route::get('/users/{id}/attendances', [EventAttendanceController::class, 'getMemberHistory']);
    Route::delete('/events/{id}', [EventController::class, 'destroy'])->name('events.destroy');
});
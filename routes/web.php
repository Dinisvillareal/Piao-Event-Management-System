<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;
use App\Http\Controllers\MembershipController;
use App\Http\Controllers\EventController;

/*
|--------------------------------------------------------------------------
| FRONTEND VIEWS
|--------------------------------------------------------------------------
*/

Route::get('/', function () {
    return view('app'); // ONLY ONE VIEW FOR REACT
});
Route::get('/{any}', function () {
    return view('app');
})->where('any', 'dashboard|qr|attendance|events|notify|settings');

Route::get('/staff', function () {
    return view('staff.dashboard');
})->name('staff.dashboard');

/*
|--------------------------------------------------------------------------
| AUTH ROUTES
|--------------------------------------------------------------------------
*/

Route::post('/login', [UserController::class, 'login']);

/*
|--------------------------------------------------------------------------
| USERS ROUTES
|--------------------------------------------------------------------------
*/

Route::prefix('users')->group(function () {
    Route::get('/', [UserController::class, 'index']);
    Route::post('/', [UserController::class, 'store']);
    Route::get('/{id}', [UserController::class, 'show']);
    Route::put('/{id}', [UserController::class, 'update']);
    Route::delete('/{id}', [UserController::class, 'destroy']);
});

/* ROLE FILTERS */
Route::get('/users/staff', [UserController::class, 'staff']);
Route::get('/users/member', [UserController::class, 'member']);

/*
|--------------------------------------------------------------------------
| MEMBERSHIPS ROUTES
|--------------------------------------------------------------------------
*/

Route::resource('memberships', MembershipController::class);

Route::prefix('memberships')->group(function () {
    Route::get('/paginated', [MembershipController::class, 'getPaginated']);
    Route::get('/simple', [MembershipController::class, 'getSimplePaginated']);
    Route::get('/cursor', [MembershipController::class, 'getCursorPaginated']);
    Route::get('/search', [MembershipController::class, 'searchPaginated']);
    Route::get('/sort', [MembershipController::class, 'sortPaginated']);
});

/*
|--------------------------------------------------------------------------
| EVENTS ROUTES
|--------------------------------------------------------------------------
*/

Route::prefix('events')->group(function () {
    Route::get('/', [EventController::class, 'index'])->name('events.index');
    Route::get('/{id}', [EventController::class, 'show'])->name('events.show');

    Route::post('/', [EventController::class, 'store'])->name('events.store');
    Route::put('/{id}', [EventController::class, 'update'])->name('events.update');
    Route::delete('/{id}', [EventController::class, 'destroy'])->name('events.destroy');
});


/*
|--------------------------------------------------------------------------
| EVENT ATTENDANCE ROUTES
|--------------------------------------------------------------------------
*/
Route::prefix('attendance')->group(function () {
    // Mobile/QR Scanner routes
    Route::post('/time-in', [AttendanceController::class, 'timeIn']);
    Route::put('/time-out', [AttendanceController::class, 'timeOut']);
});

// Fetching lists for the Dashboards
Route::get('/events/{id}/attendances', [AttendanceController::class, 'getEventAttendees']);
Route::get('/users/{id}/attendances', [AttendanceController::class, 'getMemberHistory']);
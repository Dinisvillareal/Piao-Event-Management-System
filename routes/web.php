<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;
use App\Http\Controllers\MembershipController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\MembershipResidentController; //newl

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
})->where('any', 'dashboard|qr|attendance|events|notify|settings|staff');

// AUTH
Route::post('/login', [UserController::class, 'login']);

// USERS CRUD
Route::get('/users', [UserController::class, 'index']);
Route::get('/users/{id}', [UserController::class, 'show']);
Route::post('/users', [UserController::class, 'store']);
Route::put('/users/{id}', [UserController::class, 'update']);
Route::delete('/users/{id}', [UserController::class, 'destroy']);

// ROLE FILTERS
Route::get('/users-staff', [UserController::class, 'staff']);
Route::get('/users-member', [UserController::class, 'member']);

// Mock data for views (only used if you still want Blade dashboards)
$mockMemberships = [
    ['id' => 1, 'name' => 'Pantawid Pamilya', 'color' => '#2563eb', 'role' => 'Member'],
    ['id' => 2, 'name' => 'Piao Residents', 'color' => '#10b981', 'role' => 'Resident']
];

Route::get('/member', function () use ($mockMemberships) {
    return view('member.dashboard', ['memberships' => $mockMemberships]);
})->name('member.dashboard');

Route::get('/staff', function () {
    return view('staff.dashboard');
})->name('staff.dashboard');

/*
|--------------------------------------------------------------------------
| AUTH ROUTES
|--------------------------------------------------------------------------
*/

Route::post('/login', [UserController::class, 'login']);
Route::post('/logout', [UserController::class, 'logout']);
Route::get('/me', [UserController::class, 'me'])->middleware('auth');

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

Route::post('/events', [EventController::class, 'store'])->name('events.store');
Route::put('/events/{id}', [EventController::class, 'update'])->name('events.update');

Route::delete('/events/{id}', [EventController::class, 'destroy'])->name('events.destroy');

Route::get('/membership-residents', [MembershipResidentController::class, 'index']);

Route::get('/membership-residents/{id}', [MembershipResidentController::class, 'show']);

Route::post('/membership-residents', [MembershipResidentController::class, 'store']);

Route::put('/membership-residents/{id}', [MembershipResidentController::class, 'update']);

Route::delete('/membership-residents/{id}', [MembershipResidentController::class, 'destroy']);

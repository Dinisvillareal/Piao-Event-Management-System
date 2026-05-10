<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;
use App\Http\Controllers\MembershipController;
use App\Http\Controllers\EventController; //newly added Web May 6, 2026 9:22 AM Wednesday
use App\Http\Controllers\MembershipResidentController; //newly added Web May 10, 2026 2:00 PM Sunday

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

// Resource routes
Route::resource('memberships', MembershipController::class);

// Additional pagination routes
Route::get('/memberships-paginated', [MembershipController::class, 'getPaginated']);
Route::get('/memberships-simple', [MembershipController::class, 'getSimplePaginated']);
Route::get('/memberships-cursor', [MembershipController::class, 'getCursorPaginated']);
Route::get('/memberships-search', [MembershipController::class, 'searchPaginated']);
Route::get('/memberships-sort', [MembershipController::class, 'sortPaginated']);

Route::get('/events', [EventController::class, 'index'])->name('events.index');
Route::get('/events/{id}', [EventController::class, 'show'])->name('events.show');

Route::post('/events', [EventController::class, 'store'])->name('events.store');
Route::put('/events/{id}', [EventController::class, 'update'])->name('events.update');

Route::delete('/events/{id}', [EventController::class, 'destroy'])->name('events.destroy');

Route::get('/membership-residents', [MembershipResidentController::class, 'index']);

Route::get('/membership-residents/{id}', [MembershipResidentController::class, 'show']);

Route::post('/membership-residents', [MembershipResidentController::class, 'store']);

Route::put('/membership-residents/{id}', [MembershipResidentController::class, 'update']);

Route::delete('/membership-residents/{id}', [MembershipResidentController::class, 'destroy']);

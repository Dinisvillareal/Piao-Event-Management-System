<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;
use App\Http\Controllers\MembershipController; //newly added Web May 6, 2026 9:22 AM Wednesday

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

// Mock data for views
$mockMemberships = [
    ['id' => 1, 'name' => 'Pantawid Pamilya', 'color' => '#2563eb', 'role' => 'Member'],
    ['id' => 2, 'name' => 'Piao Residents', 'color' => '#10b981', 'role' => 'Resident']
];

Route::get('/', function () {
    return view('welcome');
});

Route::get('/member', function () use ($mockMemberships) {
    return view('member.dashboard', ['memberships' => $mockMemberships]);
})->name('member.dashboard');

Route::get('/staff', function () {
    return view('staff.dashboard');
})->name('staff.dashboard');

//newly added May 6, 2026 9:22 AM Wednesday
// Basic resource routes
Route::resource('memberships', MembershipController::class);

// Additional pagination routes
Route::get('/memberships-paginated', [MembershipController::class, 'getPaginated']);
Route::get('/memberships-simple', [MembershipController::class, 'getSimplePaginated']);
Route::get('/memberships-cursor', [MembershipController::class, 'getCursorPaginated']);
Route::get('/memberships-search', [MembershipController::class, 'searchPaginated']);
Route::get('/memberships-sort', [MembershipController::class, 'sortPaginated']);
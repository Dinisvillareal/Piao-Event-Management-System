<?php

use Illuminate\Support\Facades\Route;

$mockMemberships = [
    ['id' => 1, 'name' => 'Pantantawid', 'color' => '#2563eb', 'role' => 'Member'],
    ['id' => 2, 'name' => 'Piao Residents', 'color' => '#10b981', 'role' => 'Resident']
];

Route::get('/', function () {
    return view('welcome');
});


Route::get('/member', function () use ($mockMemberships) {
    return view('member.dashboard', ['memberships' => $mockMemberships]);
})->name('member.dashboard');

// 3. The Staff Route
Route::get('/staff', function () {
    return view('staff.dashboard');
})->name('staff.dashboard');

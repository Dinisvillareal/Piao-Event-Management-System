<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;

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

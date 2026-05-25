<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;

class UserController extends Controller
{
    // =========================
    // HELPERS
    // =========================

    private function isStaff()
    {
        return auth()->user()?->role === 'Staff';
    }

    private function isOwnProfile($id)
    {
        return auth()->id() == $id;
    }

    // =========================
    // CREATE USER
    // =========================

    public function store(StoreUserRequest $request)
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $last = User::withTrashed()
            ->latest('id')
            ->first();

        $next = $last && $last->user_code
            ? (int) str_replace(
                'PR-',
                '',
                $last->user_code
            ) + 1
            : 1;

        $userCode =
            'PR-' .
            str_pad(
                $next,
                4,
                '0',
                STR_PAD_LEFT
            );

        // =========================
        // FTP FILE UPLOAD
        // =========================

        $validationIdPath = null;

        if ($request->hasFile('validation_id')) {

            $file = $request->file(
                'validation_id'
            );

            $filename =
                time() .
                '_' .
                $file->getClientOriginalName();

            $validationIdPath = $file->storeAs(
                'validation_ids',
                $filename,
                'ftp'
            );
        }

        $user = User::create([

            'user_code' => $userCode,

            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'middle_name' => $request->middle_name,

            'contact_number' => $request->contact_number,

            // FILE PATH
            'validation_id' => $validationIdPath,

            'role' => $request->role,

            // ALWAYS USE STAFF PASSWORD
            // EVEN has_account = 0
            'password' => Hash::make(
                $request->password
            ),

            // KEEP ORIGINAL BOOLEAN
            'has_account' => $request->has_account,
        ]);

        return response()->json([
            'message' => 'User created successfully',
            'user' => $user
        ], 201);
    }

    // =========================
    // LOGIN
    // =========================

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required',
            'password' => 'required',
        ]);

        $user = User::where(
            'user_code',
            $request->username
        )->first();

        if (
            !$user ||
            !Hash::check(
                $request->password,
                $user->password
            )
        ) {
            return response()->json([
                'message' => 'Invalid credentials'
            ], 401);
        }

        Auth::login(
            $user,
            $request->boolean('remember_me')
        );

        $request->session()->regenerate();

        return response()->json([
            'message' => 'Login successful',
            'user' => $user
        ]);
    }

    // =========================
    // ALL USERS
    // =========================

    public function index()
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        return response()->json(
            User::withTrashed()
                ->with('memberships')
                ->paginate(20)
        );
    }

    // =========================
    // STAFF USERS
    // =========================

    public function staff()
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        return response()->json(
            User::where(
                'role',
                'Staff'
            )->paginate(20)
        );
    }

    // =========================
    // RESIDENT USERS
    // =========================

    public function resident()
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        return response()->json(
            User::where(
                'role',
                'Resident'
            )->paginate(20)
        );
    }

    // =========================
    // SHOW USER
    // =========================

    public function show($id)
    {
        if (
            !$this->isOwnProfile($id)
            && !$this->isStaff()
        ) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        return response()->json(
            User::withTrashed()
                ->with('memberships')
                ->findOrFail($id)
        );
    }

    // =========================
    // UPDATE USER
    // =========================

    public function update(
        UpdateUserRequest $request,
        $id
    ) {
        if (
            !$this->isOwnProfile($id)
            && !$this->isStaff()
        ) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $user = User::findOrFail($id);

        // =========================
        // UPDATE FILE
        // =========================

        if ($request->hasFile('validation_id')) {

            if ($user->validation_id) {

                Storage::disk('ftp')->delete(
                    $user->validation_id
                );
            }

            $file = $request->file(
                'validation_id'
            );

            $filename =
                time() .
                '_' .
                $file->getClientOriginalName();

            $validationIdPath = $file->storeAs(
                'validation_ids',
                $filename,
                'ftp'
            );

            $user->validation_id =
                $validationIdPath;
        }

        $user->first_name =
            $request->first_name
            ?? $user->first_name;

        $user->last_name =
            $request->last_name
            ?? $user->last_name;

        $user->middle_name =
            $request->middle_name
            ?? $user->middle_name;

        $user->contact_number =
            $request->contact_number
            ?? $user->contact_number;

        $user->role =
            $request->role
            ?? $user->role;

        // KEEP ORIGINAL BOOLEAN
        $user->has_account =
            $request->has_account
            ?? $user->has_account;

        // PASSWORD UPDATE
        if ($request->filled('password')) {

            $user->password = Hash::make(
                $request->password
            );
        }

        $user->save();

        return response()->json([
            'message' =>
                'User updated successfully'
        ]);
    }

    // =========================
    // DELETE
    // =========================

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        User::findOrFail($id)->delete();

        return response()->json([
            'message' => 'Deleted'
        ]);
    }

    // =========================
    // RESTORE
    // =========================

    public function restore($id)
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        User::onlyTrashed()
            ->findOrFail($id)
            ->restore();

        return response()->json([
            'message' => 'Restored'
        ]);
    }

    // =========================
    // FORCE DELETE
    // =========================

    public function forceDelete($id)
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $user = User::onlyTrashed()
            ->findOrFail($id);

        // DELETE FTP FILE
        if ($user->validation_id) {

            Storage::disk('ftp')->delete(
                $user->validation_id
            );
        }

        $user->forceDelete();

        return response()->json([
            'message' =>
                'Permanently deleted'
        ]);
    }

    // =========================
    // LOGOUT
    // =========================

    public function logout(Request $request)
    {
        Auth::logout();

        $request->session()->invalidate();

        $request->session()
            ->regenerateToken();

        return response()->json([
            'message' =>
                'Logged out successfully'
        ]);
    }

    // =========================
    // CURRENT USER
    // =========================

    public function me(Request $request)
    {
        return response()->json(
            $request->user()
        );
    }
}

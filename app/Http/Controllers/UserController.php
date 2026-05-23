<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;
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
    // CREATE USER (MERGED FEATURES)
    // =========================
    public function store(StoreUserRequest $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $last = User::withTrashed()->latest('id')->first();

        $next = $last && $last->user_code
            ? (int) str_replace('PR-', '', $last->user_code) + 1
            : 1;

        $pad = max(4, strlen((string)$next));

        $userCode = 'PR-' . str_pad($next, $pad, '0', STR_PAD_LEFT);
        $tempPassword = 'temp-' . str_pad($next, $pad, '0', STR_PAD_LEFT);

        $user = User::create([
            'user_code' => $userCode,
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'middle_name' => $request->middle_name,
            'contact_number' => $request->contact_number,
            'role' => $request->role,
            'password' => Hash::make($tempPassword),
            'has_account' => 0,
        ]);

        return response()->json([
            'message' => 'User created successfully',
            'user_code' => $userCode,
            'temporary_password' => $tempPassword,
            'user' => $user
        ], 201);
    }

    // =========================
    // LOGIN (FIXED SESSION SAFE)
    // =========================
    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required',
            'password' => 'required',
        ]);

        $user = User::where('user_code', $request->username)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        Auth::login($user, $request->boolean('remember_me'));

        $request->session()->regenerate();

        return response()->json([
            'message' => 'Login successful',
            'user' => $user
        ]);
    }

    // =========================
    // GET ALL USERS (STAFF ONLY)
    // =========================
    public function index()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            User::withTrashed()
                ->with('memberships')
                ->paginate(20)
        );
    }

    // =========================
    // STAFF LIST
    // =========================
    public function staff()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            User::where('role', 'Staff')->paginate(20)
        );
    }

    // =========================
    // RESIDENT LIST
    // =========================
    public function resident()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            User::where('role', 'Resident')->paginate(20)
        );
    }

    // =========================
    // SHOW USER
    // =========================
    public function show($id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
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
    public function update(UpdateUserRequest $request, $id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = User::findOrFail($id);

        $user->update([
            'first_name' => $request->first_name ?? $user->first_name,
            'last_name' => $request->last_name ?? $user->last_name,
            'middle_name' => $request->middle_name ?? $user->middle_name,
            'contact_number' => $request->contact_number ?? $user->contact_number,
            'role' => $request->role ?? $user->role,
        ]);

        if ($request->password) {
            $user->update([
                'password' => Hash::make($request->password),
                'has_account' => 1
            ]);
        }

        return response()->json(['message' => 'User updated successfully']);
    }

    // =========================
    // DELETE (SOFT DELETE)
    // =========================
    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        User::findOrFail($id)->delete();

        return response()->json(['message' => 'Deleted']);
    }

    // =========================
    // RESTORE USER
    // =========================
    public function restore($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        User::onlyTrashed()->findOrFail($id)->restore();

        return response()->json(['message' => 'Restored']);
    }

    // =========================
    // FORCE DELETE
    // =========================
    public function forceDelete($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        User::onlyTrashed()->findOrFail($id)->forceDelete();

        return response()->json(['message' => 'Permanently deleted']);
    }

    // =========================
    // LOGOUT
    // =========================
    public function logout(Request $request)
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Logged out successfully']);
    }

    // =========================
    // CURRENT USER
    // =========================
    public function me(Request $request)
    {
        return response()->json($request->user());
    }
}

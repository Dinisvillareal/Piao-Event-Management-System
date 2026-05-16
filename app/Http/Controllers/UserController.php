<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Http\Request;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Requests\StoreUserRequest;

class UserController extends Controller
{
    // Helper methods for authorization
    private function isStaff()
    {
        $user = auth()->user();
        return $user && $user->role === 'Staff';
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
        // ✅ Only staff can create users
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can create users'
            ], 403);
        }

        $last = User::latest('id')->first();

        $next = $last && $last->user_code
            ? (int) str_replace('PR-', '', $last->user_code) + 1
            : 1;

        $pr = 'PR-' . str_pad($next, 6, '0', STR_PAD_LEFT);

        $user = User::create([
            'user_code' => $pr,
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'middle_name' => $request->middle_name,
            'contact_number' => $request->contact_number,
            'role' => $request->role,
            'password' => Hash::make($request->password),
        ]);

        return response()->json([
            'message' => 'User created successfully',
            'user_code' => $pr,
            'user' => $user
        ], 201);
    }

    // =========================
    // LOGIN
    // =========================
    public function login(Request $request)
    {
        $user = User::where('user_code', $request->username)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        auth()->login($user, $request->remember_me ?? false);

        return response()->json([
            'message' => 'Login successful',
            'user' => $user
        ]);
    }

    // =========================
    // GET ALL USERS
    // =========================
    public function index(Request $request)
    {
        // ✅ Only staff can view all users
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can view all users'
            ], 403);
        }

        $query = User::query();

        if ($request->role) {
            $query->where('role', $request->role);
        }

        return response()->json($query->get());
    }

    // =========================
    // STAFF
    // =========================
    public function staff()
    {
        // ✅ Only staff can view staff list
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can view staff list'
            ], 403);
        }

        return response()->json(
            User::where('role', 'Staff')->paginate(20)
        );
    }

    // =========================
    // RESIDENT
    // =========================
    public function resident()
    {
        // ✅ Only staff can view resident list
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can view resident list'
            ], 403);
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
        // ✅ Users can view their own profile, staff can view any
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: You can only view your own profile'
            ], 403);
        }

        return response()->json(
            User::findOrFail($id)
        );
    }

    // =========================
    // UPDATE USER
    // =========================
    public function update(UpdateUserRequest $request, $id)
    {
        // ✅ Users can update their own profile, staff can update any
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: You can only update your own profile'
            ], 403);
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
                'password' => Hash::make($request->password)
            ]);
        }

        return response()->json([
            'message' => 'User updated successfully'
        ]);
    }

    // =========================
    // DELETE USER
    // =========================
    public function destroy($id)
    {
        // ✅ Only staff can delete users
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized: Only staff can delete users'
            ], 403);
        }

        User::findOrFail($id)->delete();

        return response()->json([
            'message' => 'User deleted successfully'
        ]);
    }

    // =========================
    // LOGOUT
    // =========================
    public function logout(Request $request)
    {
        auth()->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Logged out successfully'
        ]);
    }

    // =========================
    // CURRENT USER
    // =========================
    public function me(Request $request)
    {
        return response()->json($request->user());
    }
}
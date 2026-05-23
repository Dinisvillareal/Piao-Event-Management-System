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
    // =====================
    // HELPERS
    // =====================

    private function isStaff()
    {
        return auth()->user()?->role === 'Staff';
    }

    private function isOwnProfile($id)
    {
        return auth()->id() == $id;
    }

    // =====================
    // CREATE USER
    // =====================

    public function store(StoreUserRequest $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $last = User::withTrashed()->latest('id')->first();

        $next = $last && $last->user_code
            ? (int) str_replace('PR-', '', $last->user_code) + 1
            : 1;

        $userCode = 'PR-' . str_pad($next, 4, '0', STR_PAD_LEFT);

        // =====================
        // FTP UPLOAD
        // =====================

        $filePath = null;

        if ($request->hasFile('validation_id')) {

            $file = $request->file('validation_id');

            $filename = time() . '_' . $file->getClientOriginalName();

            $filePath = $file->storeAs(
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

            // FTP IMAGE PATH
            'validation_id' => $filePath,

            'role' => $request->role,

            // ALWAYS USE INPUT PASSWORD
            'password' => Hash::make($request->password),

            // NEVER AUTO CHANGE
            'has_account' => $request->has_account,
        ]);

        return response()->json([
            'message' => 'User created successfully',
            'user' => $user
        ], 201);
    }

    // =====================
    // LOGIN
    // =====================

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

    // =====================
    // LIST USERS
    // =====================

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

    public function staff()
    {
        return response()->json(
            User::where('role', 'Staff')->paginate(20)
        );
    }

    public function resident()
    {
        return response()->json(
            User::where('role', 'Resident')->paginate(20)
        );
    }

    // =====================
    // SHOW
    // =====================

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

    // =====================
    // UPDATE
    // =====================

    public function update(UpdateUserRequest $request, $id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = User::findOrFail($id);

        // UPDATE FILE
        if ($request->hasFile('validation_id')) {

            if ($user->validation_id) {
                Storage::disk('ftp')->delete($user->validation_id);
            }

            $file = $request->file('validation_id');
            $filename = time() . '_' . $file->getClientOriginalName();

            $user->validation_id = $file->storeAs(
                'validation_ids',
                $filename,
                'ftp'
            );
        }

        $user->update([
            'first_name' => $request->first_name ?? $user->first_name,
            'last_name' => $request->last_name ?? $user->last_name,
            'middle_name' => $request->middle_name ?? $user->middle_name,
            'contact_number' => $request->contact_number ?? $user->contact_number,
            'role' => $request->role ?? $user->role,

            // NEVER AUTO CHANGE
            'has_account' => $request->has_account ?? $user->has_account,
        ]);

        if ($request->filled('password')) {
            $user->update([
                'password' => Hash::make($request->password)
            ]);
        }

        return response()->json([
            'message' => 'User updated successfully'
        ]);
    }

    // =====================
    // DELETE
    // =====================

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        User::findOrFail($id)->delete();

        return response()->json(['message' => 'Deleted']);
    }

    // =====================
    // RESTORE
    // =====================

    public function restore($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        User::onlyTrashed()->findOrFail($id)->restore();

        return response()->json(['message' => 'Restored']);
    }

    // =====================
    // FORCE DELETE
    // =====================

    public function forceDelete($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = User::onlyTrashed()->findOrFail($id);

        if ($user->validation_id) {
            Storage::disk('ftp')->delete($user->validation_id);
        }

        $user->forceDelete();

        return response()->json(['message' => 'Permanently deleted']);
    }

    // =====================
    // AUTH
    // =====================

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }
}

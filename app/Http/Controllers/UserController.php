<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
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

    /**
     * Upload file to FTP. Returns stored path string.
     * Throws \Exception on failure so the outer DB transaction can roll back.
     */
    private function ftpUpload($file): string
    {
        $filename = time() . '_' . $file->getClientOriginalName();
        $path     = $file->storeAs('validation_ids', $filename, 'ftp');

        if (!$path) {
            throw new \Exception('FTP upload failed — storeAs() returned false.');
        }

        return $path;
    }

    /**
     * Delete a file from FTP silently (don't crash if it's already gone).
     */
    private function ftpDelete(string $path): void
    {
        try {
            Storage::disk('ftp')->delete($path);
        } catch (\Exception $e) {
            \Log::warning("FTP delete failed for [{$path}]: " . $e->getMessage());
        }
    }

    // =========================
    // CREATE USER
    // =========================

    public function store(StoreUserRequest $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        DB::beginTransaction();

        $path = null;

        try {

            // ── User code ──────────────────────────────────────────────────
            $last    = User::withTrashed()->latest('id')->first();
            $nextNum = $last ? ((int) str_replace('PR-', '', $last->user_code) + 1) : 1;
            $userCode = 'PR-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);

            // ── FTP upload (if file provided) ──────────────────────────────
            if ($request->hasFile('validation_id')) {
                $path = $this->ftpUpload($request->file('validation_id'));
            }

            // ── Password ───────────────────────────────────────────────────
            // Hash password whenever has_account=1 AND password is provided,
            // regardless of role (frontend controls this).
            $hasAccount = filter_var($request->has_account, FILTER_VALIDATE_BOOLEAN);
            $password   = null;

            if ($hasAccount && $request->filled('password')) {
                $password = Hash::make($request->password);
            }

            // ── Create user ────────────────────────────────────────────────
            $user = User::create([
                'user_code'      => $userCode,
                'first_name'     => $request->first_name,
                'last_name'      => $request->last_name,
                'middle_name'    => $request->middle_name,
                'contact_number' => $request->contact_number,
                'validation_id'  => $path,
                'role'           => $request->role,
                'has_account'    => $hasAccount ? 1 : 0,
                'password'       => $password,
            ]);

            // ── Memberships ────────────────────────────────────────────────
            if ($request->has('membership_ids')) {
                $ids = array_filter((array) $request->membership_ids);
                if (!empty($ids)) {
                    $user->memberships()->sync($ids);
                }
            }

            DB::commit();

            return response()->json([
                'message' => 'User created successfully',
                'user'    => $user->load('memberships'),
            ], 201);

        } catch (\Exception $e) {

            DB::rollBack();

            // Clean up uploaded file if DB failed
            if ($path) {
                $this->ftpDelete($path);
            }

            return response()->json([
                'message' => 'Transaction failed',
                'error'   => $e->getMessage(),
            ], 500);
        }
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

        $user = User::where('user_code', $request->username)->first();

        if (!$user || !$user->has_account) {
            return response()->json(['message' => 'Account not activated'], 401);
        }

        if (!Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        Auth::login($user, $request->boolean('remember_me'));
        $request->session()->regenerate();

        return response()->json([
            'message' => 'Login successful',
            'user'    => $user,
        ]);
    }

    // =========================
    // GET USERS
    // =========================

    public function index(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = User::withTrashed()->with('memberships');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('user_code', 'like', "%$search%")
                  ->orWhere('first_name', 'like', "%$search%")
                  ->orWhere('last_name', 'like', "%$search%")
                  ->orWhere('middle_name', 'like', "%$search%")
                  ->orWhere('contact_number', 'like', "%$search%")
                  ->orWhere('role', 'like', "%$search%");
            });
        }

        if ($request->filled('role')) {
            $query->where('role', $request->role);
        }

        return response()->json($query->paginate(20));
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
            User::withTrashed()->with('memberships')->findOrFail($id)
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

        DB::beginTransaction();

        try {

            $user = User::findOrFail($id);

            // ── Basic fields ───────────────────────────────────────────────
            $user->fill($request->only([
                'first_name',
                'last_name',
                'middle_name',
                'contact_number',
            ]));

            // ── Role (staff only) ──────────────────────────────────────────
            if ($this->isStaff() && $request->filled('role')) {
                $user->role = $request->role;
            }

            // ── Account flag ───────────────────────────────────────────────
            if ($request->has('has_account')) {
                $user->has_account = filter_var($request->has_account, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
            }

            // ── Password ───────────────────────────────────────────────────
            if ($request->filled('password')) {
                $user->password    = Hash::make($request->password);
                $user->has_account = 1;
            }

            // ── FTP file update ────────────────────────────────────────────
            if ($request->hasFile('validation_id')) {

                // Delete old file first
                if ($user->validation_id) {
                    $this->ftpDelete($user->validation_id);
                }

                $user->validation_id = $this->ftpUpload($request->file('validation_id'));
            }

            $user->save();

            // ── Memberships (staff only) ───────────────────────────────────
            if ($this->isStaff() && $request->has('membership_ids')) {
                $ids = array_filter((array) $request->membership_ids);
                if (empty($ids)) {
                    $user->memberships()->detach();
                } else {
                    $user->memberships()->sync($ids);
                }
            }

            DB::commit();

            return response()->json([
                'message' => 'User updated successfully',
                'user'    => $user->load('memberships'),
            ]);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Update failed',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // =========================
    // DELETE USER (SOFT)
    // =========================

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        User::findOrFail($id)->delete();

        return response()->json(['message' => 'Deleted successfully']);
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

        return response()->json(['message' => 'Restored successfully']);
    }

    // =========================
    // FORCE DELETE USER
    // =========================

    public function forceDelete($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        DB::beginTransaction();

        try {

            $user = User::onlyTrashed()->findOrFail($id);

            if ($user->validation_id) {
                $this->ftpDelete($user->validation_id);
            }

            $user->memberships()->detach();
            $user->forceDelete();

            DB::commit();

            return response()->json(['message' => 'Permanently deleted']);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Force delete failed',
                'error'   => $e->getMessage(),
            ], 500);
        }
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
        return response()->json(
            $request->user()->load('memberships')
        );
    }
}

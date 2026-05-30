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
     * Upload file to LOCAL public disk.
     * Stored under storage/app/public/validation_ids/
     * Accessible via /storage/validation_ids/<filename> after `php artisan storage:link`
     *
     * WHY CHANGED: Previously used Storage::disk('ftp') which requires a remote FTP server.
     * Using Storage::disk('public') writes to storage/app/public/ which Laravel symlinks
     * to public/storage/ — making files accessible via standard HTTP URLs with no extra config.
     */
    private function localUpload($file): string
    {
        // Sanitize filename: replace spaces and any character that isn't
        // alphanumeric, dash, underscore, or dot with an underscore.
        // e.g. "IT2228 - Activity Design It Fast.png" → "IT2228_-_Activity_Design_It_Fast.png"
        // This prevents broken URLs caused by spaces or special characters.
        $original = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $ext      = $file->getClientOriginalExtension();
        $clean    = preg_replace('/[^A-Za-z0-9\-_.]/', '_', $original);
        $filename = time() . '_' . $clean . '.' . $ext;

        $path = $file->storeAs('validation_ids', $filename, 'public');

        if (!$path) {
            throw new \Exception('File upload failed — storeAs() returned false.');
        }

        return $path; // e.g. "validation_ids/1780042815_IT2228_-_Activity_Design_It_Fast.png"
    }

    /**
     * Delete a file from LOCAL public disk silently.
     *
     * WHY CHANGED: Same disk change as localUpload — must match the disk used to store the file.
     */
    private function localDelete(string $path): void
    {
        try {
            Storage::disk('public')->delete($path);
        } catch (\Exception $e) {
            \Log::warning("Local file delete failed for [{$path}]: " . $e->getMessage());
        }
    }

    /**
     * Return the full public URL for a stored validation_id path.
     * Returns null if no path is stored.
     *
     * WHY ADDED: The frontend previously built the URL by concatenating VITE_FTP_URL + path.
     * Now the backend returns the complete, ready-to-use URL so the frontend just uses it directly.
     * Storage::disk('public')->url($path) returns e.g. "http://yourapp.test/storage/validation_ids/photo.jpg"
     */
    private function validationIdUrl(?string $path): ?string
    {
        if (!$path) return null;
        return Storage::disk('public')->url($path);
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

            // ── Local upload (if file provided) ────────────────────────────
            // WHY: replaced $this->ftpUpload() with $this->localUpload()
            if ($request->hasFile('validation_id')) {
                $path = $this->localUpload($request->file('validation_id'));
            }

            // ── Password ───────────────────────────────────────────────────
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
                'validation_id'  => $path, // stores the relative path, e.g. "validation_ids/file.jpg"
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
                $this->localDelete($path);
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

            // ── Local file update ──────────────────────────────────────────
            // WHY: replaced ftpDelete/ftpUpload with localDelete/localUpload
            if ($request->hasFile('validation_id')) {

                // Delete old file first
                if ($user->validation_id) {
                    $this->localDelete($user->validation_id);
                }

                $user->validation_id = $this->localUpload($request->file('validation_id'));
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

            // WHY: replaced ftpDelete with localDelete
            if ($user->validation_id) {
                $this->localDelete($user->validation_id);
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
// CHANGE PASSWORD
// =========================

public function changePassword(Request $request, $id)
{
    if (!$this->isOwnProfile($id) && !$this->isStaff()) {
        return response()->json(['message' => 'Unauthorized'], 403);
    }

    $request->validate([
        'new_password' => 'required|string|min:8|confirmed',
    ]);

    DB::beginTransaction();

    try {
        $user              = User::findOrFail($id);
        $user->password    = Hash::make($request->new_password);
        $user->has_account = 1;
        $user->save();

        DB::commit();

        return response()->json(['message' => 'Password updated successfully']);

    } catch (\Exception $e) {
        DB::rollBack();
        return response()->json([
            'message' => 'Password update failed',
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

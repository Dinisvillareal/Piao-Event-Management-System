<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\ActivityLog;
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

    private function createLog($action, $module, $description)
    {
        ActivityLog::create([
            'user_code'   => auth()->user()?->user_code ?? 'SYSTEM',
            'action'      => $action,
            'module'      => $module,
            'description' => $description,
        ]);
    }

    private function localUpload($file): string
    {
        $original = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $ext      = $file->getClientOriginalExtension();
        $clean    = preg_replace('/[^A-Za-z0-9\-_.]/', '_', $original);
        $filename = time() . '_' . $clean . '.' . $ext;

        $path = $file->storeAs('validation_ids', $filename, 'public');

        if (!$path) {
            throw new \Exception('File upload failed');
        }

        return $path;
    }

    private function localDelete(string $path): void
    {
        try {
            Storage::disk('public')->delete($path);
        } catch (\Exception $e) {
            \Log::warning($e->getMessage());
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

            $last = User::withTrashed()->latest('id')->first();
            $nextNum = $last ? ((int) str_replace('PR-', '', $last->user_code) + 1) : 1;
            $userCode = 'PR-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);

            if ($request->hasFile('validation_id')) {
                $path = $this->localUpload($request->file('validation_id'));
            }

            $hasAccount = filter_var($request->has_account, FILTER_VALIDATE_BOOLEAN);

            $user = User::create([
                'user_code'      => $userCode,
                'first_name'     => $request->first_name,
                'last_name'      => $request->last_name,
                'middle_name'    => $request->middle_name,
                'contact_number' => $request->contact_number,
                'validation_id'  => $path,
                'role'           => $request->role,
                'has_account'    => $hasAccount ? 1 : 0,
                'password'       => $hasAccount ? Hash::make($request->password) : null,
            ]);

            if ($request->has('membership_ids')) {
                $ids = array_filter((array) $request->membership_ids);
                if (!empty($ids)) {
                    $user->memberships()->sync($ids);
                }
            }

            $this->createLog(
                'Create User',
                'User',
                "Created user {$user->user_code}"
            );

            DB::commit();

            return response()->json([
                'message' => 'User created successfully',
                'user' => $user->load('memberships')
            ], 201);

        } catch (\Exception $e) {

            DB::rollBack();

            if ($path) {
                $this->localDelete($path);
            }

            return response()->json([
                'message' => 'Transaction failed',
                'error' => $e->getMessage(),
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

        // Log only Staff login
        if ($user->role === 'Staff') {
            ActivityLog::create([
                'user_code'   => $user->user_code,
                'action'      => 'Login',
                'module'      => 'Authentication',
                'description' => 'Staff logged in',
            ]);
        }

        return response()->json([
            'message' => 'Login successful',
            'user' => $user
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

            $user->fill($request->only([
                'first_name',
                'last_name',
                'middle_name',
                'contact_number',
            ]));

            if ($this->isStaff() && $request->filled('role')) {
                $user->role = $request->role;
            }

            if ($request->has('has_account')) {
                $user->has_account = filter_var($request->has_account, FILTER_VALIDATE_BOOLEAN);
            }

            if ($request->filled('password')) {
                $user->password = Hash::make($request->password);
                $user->has_account = 1;
            }

            if ($request->hasFile('validation_id')) {
                if ($user->validation_id) {
                    $this->localDelete($user->validation_id);
                }
                $user->validation_id = $this->localUpload($request->file('validation_id'));
            }

            $user->save();

            if ($this->isStaff() && $request->has('membership_ids')) {
                $ids = array_filter((array) $request->membership_ids);

                if (empty($ids)) {
                    $user->memberships()->detach();
                } else {
                    $user->memberships()->sync($ids);
                }
            }

            $this->createLog(
                'Update User',
                'User',
                "Updated user {$user->user_code}"
            );

            DB::commit();

            return response()->json([
                'message' => 'User updated successfully',
                'user' => $user->load('memberships')
            ]);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Update failed',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // =========================
    // DELETE USER
    // =========================

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = User::findOrFail($id);
        $user->delete();

        $this->createLog(
            'Delete User',
            'User',
            "Deleted user {$user->user_code}"
        );

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

        $user = User::onlyTrashed()->findOrFail($id);
        $user->restore();

        $this->createLog(
            'Restore User',
            'User',
            "Restored user {$user->user_code}"
        );

        return response()->json(['message' => 'Restored successfully']);
    }

    // =========================
    // FORCE DELETE
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
                $this->localDelete($user->validation_id);
            }

            $user->memberships()->detach();

            $this->createLog(
                'Force Delete User',
                'User',
                "Permanently deleted user {$user->user_code}"
            );

            $user->forceDelete();

            DB::commit();

            return response()->json(['message' => 'Permanently deleted']);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Force delete failed',
                'error' => $e->getMessage(),
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

            $user = User::findOrFail($id);
            $user->password = Hash::make($request->new_password);
            $user->has_account = 1;
            $user->save();

            $this->createLog(
                'Change Password',
                'User',
                "Changed password for user {$user->user_code}"
            );

            DB::commit();

            return response()->json(['message' => 'Password updated successfully']);

        } catch (\Exception $e) {

            DB::rollBack();

            return response()->json([
                'message' => 'Password update failed',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // =========================
    // LOGOUT
    // =========================

    public function logout(Request $request)
    {
        $user = auth()->user();

        // Log only Staff logout
        if ($user && $user->role === 'Staff') {
            ActivityLog::create([
                'user_code'   => $user->user_code,
                'action'      => 'Logout',
                'module'      => 'Authentication',
                'description' => 'Staff logged out',
            ]);
        }

        Auth::logout();

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
        return response()->json(
            $request->user()->load('memberships')
        );
    }

    // Add this method to your UserController.php after the index() method

public function getAllForMemberships()
{
    if (!$this->isStaff()) {
        return response()->json(['message' => 'Unauthorized'], 403);
    }

    try {
        $users = User::withTrashed()
            ->with('memberships')
            ->get();

        return response()->json(
            $users->map(function ($user) {
                return [
                    'id' => $user->id,
                    'user_code' => $user->user_code,
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name,
                    'middle_name' => $user->middle_name,
                    'contact_number' => $user->contact_number,
                    'role' => $user->role,
                    'has_account' => $user->has_account,
                    'deleted_at' => $user->deleted_at,
                    'memberships' => $user->memberships->map(function ($membership) {
                        return [
                            'id' => $membership->id,
                            'name' => $membership->name,
                            'description' => $membership->description,
                        ];
                    }),
                    'validation_id_url' => $user->validation_id_url,
                ];
            })
        );

    } catch (\Exception $e) {
        \Log::error('getAllForMemberships error: ' . $e->getMessage());
        return response()->json([
            'message' => 'Failed to fetch users for memberships',
            'error' => $e->getMessage()
        ], 500);
    }
}
}

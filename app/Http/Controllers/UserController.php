<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Membership;
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
        // 🔒 CRITICAL: Restore authorization check
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        // Generate PR-0001 format
        $last = User::withTrashed()->latest('id')->first();
        $nextNum = $last ? ((int) str_replace('PR-', '', $last->user_code) + 1) : 1;
        $userCode = 'PR-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);

        // Handle ID Photo Upload (FTP)
        $path = null;
        if ($request->hasFile('validation_id')) {
            $filename = time() . '_' . $request->file('validation_id')->getClientOriginalName();
            $path = $request->file('validation_id')->storeAs('validation_ids', $filename, 'ftp');
        }

        // 🔒 CRITICAL: Restore proper password handling
        // Staff users get password immediately, residents don't
        $password = null;
        if ($request->role === 'Staff' && $request->filled('password')) {
            $password = Hash::make($request->password);
        }

        $user = User::create([
            'user_code' => $userCode,
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'middle_name' => $request->middle_name,
            'contact_number' => $request->contact_number,
            'validation_id' => $path,
            'role' => $request->role,
            'has_account' => $request->role === 'Staff' ? 1 : 0, // 🔒 Staff auto have account
            'password' => $password,
        ]);

        // Handle memberships for new user
        if ($request->has('memberships')) {
            $membershipNames = json_decode($request->memberships, true);
            
            \Log::info('Creating user with memberships:', [
                'user_id' => $user->id,
                'user_code' => $userCode,
                'membership_names' => $membershipNames
            ]);
            
            if (is_array($membershipNames) && !empty($membershipNames)) {
                $membershipIds = [];
                foreach ($membershipNames as $name) {
                    $membership = Membership::where('name', $name)->first();
                    if ($membership) {
                        $membershipIds[] = $membership->id;
                    } else {
                        \Log::warning('Membership not found in database:', ['name' => $name]);
                    }
                }
                
                if (!empty($membershipIds)) {
                    $user->memberships()->attach($membershipIds);
                }
            }
        }

        return response()->json([
            'message' => 'User created successfully',
            'user' => $user->load('memberships')
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

        $user = User::where('user_code', $request->username)->first();

        // 🔒 CRITICAL: Check if user has account access
        if (!$user || !$user->has_account) {
            return response()->json([
                'message' => 'Account not activated. Please contact administrator.'
            ], 401);
        }

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid credentials'
            ], 401);
        }

        Auth::login($user, $request->boolean('remember_me'));
        $request->session()->regenerate();

        return response()->json([
            'message' => 'Login successful',
            'user' => $user
        ]);
    }

    // =========================
    // ALL USERS WITH FILTERS
    // =========================

    public function index(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $query = User::withTrashed()->with('memberships');

        // SEARCH FUNCTIONALITY
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('user_code', 'like', "%{$search}%")
                  ->orWhere('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('middle_name', 'like', "%{$search}%")
                  ->orWhere('contact_number', 'like', "%{$search}%")
                  ->orWhere('role', 'like', "%{$search}%");
            });
        }

        // ROLE FILTER
        if ($request->filled('role')) {
            $query->where('role', $request->role);
        }

        // ACCOUNT STATUS FILTER
        if ($request->has('has_account')) {
            $hasAccount = filter_var($request->has_account, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($hasAccount !== null) {
                $query->where('has_account', $hasAccount ? 1 : 0);
            }
        }

        return response()->json($query->paginate(20));
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
            User::where('role', 'Staff')->paginate(20)
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
            User::where('role', 'Resident')->paginate(20)
        );
    }

    // =========================
    // SHOW USER
    // =========================

    public function show($id)
    {
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
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

    public function update(UpdateUserRequest $request, $id)
    {
        // 🔒 Restore authorization check
        if (!$this->isOwnProfile($id) && !$this->isStaff()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $user = User::findOrFail($id);
        
        // Update basic info
        if ($request->has('first_name')) $user->first_name = $request->first_name;
        if ($request->has('last_name')) $user->last_name = $request->last_name;
        if ($request->has('middle_name')) $user->middle_name = $request->middle_name;
        if ($request->has('contact_number')) $user->contact_number = $request->contact_number;
        
        // 🔒 CRITICAL: Only staff can change roles
        if ($this->isStaff() && $request->has('role')) {
            $user->role = $request->role;
        }

        // 🔒 CRITICAL: Password update with proper authorization
        if ($request->filled('password')) {
            // Only staff can set password for others, or user changing own password
            if ($this->isStaff() || $this->isOwnProfile($id)) {
                $user->password = Hash::make($request->password);
                $user->has_account = 1; // Activate account when password is set
            } else {
                return response()->json([
                    'message' => 'Unauthorized to change password'
                ], 403);
            }
        }

        // Handle Image Update
        if ($request->hasFile('validation_id')) {
            if ($user->validation_id) {
                Storage::disk('ftp')->delete($user->validation_id);
            }
            $filename = time() . '_' . $request->file('validation_id')->getClientOriginalName();
            $user->validation_id = $request->file('validation_id')->storeAs('validation_ids', $filename, 'ftp');
        }

        $user->save();

        // Handle memberships (only staff can manage memberships)
        if ($this->isStaff() && $request->has('memberships')) {
            $membershipsRaw = $request->input('memberships');
            
            \Log::info('Update User - Memberships debug:', [
                'user_id' => $id,
                'input_memberships' => $membershipsRaw
            ]);
            
            if ($membershipsRaw) {
                $membershipNames = json_decode($membershipsRaw, true);
                
                if (is_array($membershipNames)) {
                    $membershipIds = [];
                    foreach ($membershipNames as $name) {
                        $membership = Membership::where('name', $name)->first();
                        if ($membership) {
                            $membershipIds[] = $membership->id;
                        } else {
                            \Log::warning('Membership NOT found:', ['name' => $name]);
                        }
                    }
                    
                    $user->memberships()->sync($membershipIds);
                } else {
                    $user->memberships()->sync([]);
                }
            } else {
                $user->memberships()->sync([]);
            }
        }

        return response()->json([
            'message' => 'User Record Updated', 
            'user' => $user->load('memberships')
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

        User::onlyTrashed()->findOrFail($id)->restore();

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

        $user = User::onlyTrashed()->findOrFail($id);

        if ($user->validation_id) {
            Storage::disk('ftp')->delete($user->validation_id);
        }

        $user->forceDelete();

        return response()->json([
            'message' => 'Permanently deleted'
        ]);
    }

    // =========================
    // LOGOUT
    // =========================

    public function logout(Request $request)
    {
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
        return response()->json($request->user()->load('memberships'));
    }

    // =========================
    // CHANGE PASSWORD
    // =========================

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required',
            'new_password' => 'required|min:6|confirmed',
        ]);

        $user = auth()->user();

        if (!$user->password) {
            return response()->json([
                'message' => 'You don\'t have a password set. Please contact admin to create one.'
            ], 422);
        }

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'message' => 'Current password is incorrect'
            ], 422);
        }

        $user->password = Hash::make($request->new_password);
        $user->save();

        return response()->json([
            'message' => 'Password changed successfully'
        ]);
    }

    // =========================
    // GET ALL FOR MEMBERSHIPS
    // =========================

    public function getAllForMemberships()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        
        $users = User::with('memberships')->get();
        
        return response()->json($users);
    }
}
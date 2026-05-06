<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Account;
use Illuminate\Support\Facades\Hash;
use Illuminate\Http\Request;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;

class UserController extends Controller
{
    // CREATE USER + ACCOUNT
    public function store(StoreUserRequest $request)
    {
        $user = User::create([
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'middle_name' => $request->middle_name,
            'contact_number' => $request->contact_number,
            'role' => $request->role,
        ]);

        Account::create([
            'user_id' => $user->id,
            'username' => $request->username,
            'password' => Hash::make($request->password),
        ]);

        return response()->json(['message' => 'User created successfully'], 201);
    }

    // LOGIN
    public function login(Request $request)
    {
        $account = Account::where('username', $request->username)->first();

        if (!$account || !Hash::check($request->password, $account->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        return response()->json([
            'message' => 'Login successful',
            'user' => $account->user
        ]);
    }

    // GET USERS (FILTER)
    public function index(Request $request)
    {
        $query = User::with('account');

        if ($request->role) {
            $query->where('role', $request->role);
        }

        return response()->json($query->get());
    }

    // STAFF ONLY
    public function staff()
    {
        return response()->json(
            User::with('account')
                ->where('role', 'Staff')
                ->paginate(20)
        );
    }

    // MEMBER ONLY
    public function member()
    {
        return response()->json(
            User::with('account')
                ->where('role', 'Member')
                ->paginate(20)
        );
    }

    // SHOW USER
    public function show($id)
    {
        return response()->json(
            User::with('account')->findOrFail($id)
        );
    }

    // GET ACCOUNT BY USER ID
    public function getAccountByUserId($id)
    {
        $user = User::with('account')->findOrFail($id);
        return response()->json($user->account);
    }

    // UPDATE
    public function update(UpdateUserRequest $request, $id)
    {
        $user = User::findOrFail($id);

        $user->update([
            'first_name' => $request->first_name ?? $user->first_name,
            'last_name' => $request->last_name ?? $user->last_name,
            'middle_name' => $request->middle_name ?? $user->middle_name,
            'contact_number' => $request->contact_number ?? $user->contact_number,
            'role' => $request->role ?? $user->role,
        ]);

        $account = Account::where('user_id', $id)->first();

        if ($account) {
            $account->update([
                'username' => $request->username ?? $account->username,
                'password' => $request->password
                    ? Hash::make($request->password)
                    : $account->password,
            ]);
        }

        return response()->json(['message' => 'User updated successfully']);
    }

    // DELETE
    public function destroy($id)
    {
        $user = User::findOrFail($id);
        $user->delete();

        return response()->json(['message' => 'User deleted successfully']);
    }
}

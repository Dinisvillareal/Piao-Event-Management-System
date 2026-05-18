<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [

            // =====================
            // 🔵 STAFF (10)
            // =====================
            [
                'first_name' => 'Juan',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09180000001',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Maria',
                'last_name' => 'Reyes',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000002',
                'role' => 'Staff',
                'has_account' => 0,
            ],
            [
                'first_name' => 'Carlos',
                'last_name' => 'Dela Cruz',
                'middle_name' => 'Santos',
                'contact_number' => '09180000003',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Anna',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000004',
                'role' => 'Staff',
                'has_account' => 0,
            ],
            [
                'first_name' => 'Mark',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000005',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Lisa',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09180000006',
                'role' => 'Staff',
                'has_account' => 0,
            ],
            [
                'first_name' => 'Tom',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000007',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Sara',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09180000008',
                'role' => 'Staff',
                'has_account' => 0,
            ],
            [
                'first_name' => 'David',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000009',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Emily',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000010',
                'role' => 'Staff',
                'has_account' => 0,
            ],

            // =====================
            // 🟢 RESIDENTS (10)
            // =====================
            [
                'first_name' => 'Ana',
                'last_name' => 'Santiago',
                'middle_name' => 'Dela',
                'contact_number' => '09190000001',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Bea',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000002',
                'role' => 'Resident',
                'has_account' => 0,
            ],
            [
                'first_name' => 'Cathy',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09190000003',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Diana',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000004',
                'role' => 'Resident',
                'has_account' => 0,
            ],
            [
                'first_name' => 'Ella',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000005',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Fiona',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09190000006',
                'role' => 'Resident',
                'has_account' => 0,
            ],
            [
                'first_name' => 'Grace',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000007',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Hannah',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09190000008',
                'role' => 'Resident',
                'has_account' => 0,
            ],
            [
                'first_name' => 'Ivy',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000009',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'password123',
            ],
            [
                'first_name' => 'Jane',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000010',
                'role' => 'Resident',
                'has_account' => 0,
            ],
        ];

        // =====================
        // 💾 INSERT LOGIC
        // =====================

        $nextNumber = (User::withTrashed()->count()) + 1;

        foreach ($users as $data) {

            // PR number
            $pr = 'PR-' . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);

            // temp password
            $tempPassword = 'temp-' . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);

            // safe password logic
            $plainPassword = $data['has_account']
                ? ($data['password'] ?? $tempPassword)
                : $tempPassword;

            User::create([
                'user_code' => $pr,
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'middle_name' => $data['middle_name'] ?? null,
                'contact_number' => $data['contact_number'],
                'role' => $data['role'],
                'password' => Hash::make($plainPassword),
                'has_account' => $data['has_account'],
            ]);

            $nextNumber++;
        }
    }
}

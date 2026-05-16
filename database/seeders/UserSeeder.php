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
            // 🔵 10 STAFF
            // =====================
            [
                'first_name' => 'Juan',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09180000001',
                'role' => 'Staff',
                'password' => 'staff01',
            ],
            [
                'first_name' => 'Maria',
                'last_name' => 'Reyes',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000002',
                'role' => 'Staff',
                'password' => 'staff02',
            ],
            [
                'first_name' => 'Carlos',
                'last_name' => 'Dela Cruz',
                'middle_name' => 'Santos',
                'contact_number' => '09180000003',
                'role' => 'Staff',
                'password' => 'staff03',
            ],
            [
                'first_name' => 'Anna',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000004',
                'role' => 'Staff',
                'password' => 'staff04',
            ],
            [
                'first_name' => 'Mark',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000005',
                'role' => 'Staff',
                'password' => 'staff05',
            ],

            [
                'first_name' => 'Lisa',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09180000006',
                'role' => 'Staff',
                'password' => 'staff06',
            ],

            [
                'first_name' => 'Tom',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000007',
                'role' => 'Staff',
                'password' => 'staff07',
            ],

            [
                'first_name' => 'Sara',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09180000008',
                'role' => 'Staff',
                'password' => 'staff08',
            ],

            [
                'first_name' => 'David',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000009',
                'role' => 'Staff',
                'password' => 'staff09',
            ],

            [
                'first_name' => 'Emily',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000010',
                'role' => 'Staff',
                'password' => 'staff10',
            ],

            // =====================
            // 🟢 10 RESIDENTS
            // =====================
            [
                'first_name' => 'Ana',
                'last_name' => 'Santiago',
                'middle_name' => 'Dela',
                'contact_number' => '09190000001',
                'role' => 'Resident',
                'password' => 'resident01',
            ],
            [
                'first_name' => 'Bea',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000002',
                'role' => 'Resident',
                'password' => 'resident02',
            ],
            [
                'first_name' => 'Cathy',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09190000003',
                'role' => 'Resident',
                'password' => 'resident03',
            ],
            [
                'first_name' => 'Diana',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000004',
                'role' => 'Resident',
                'password' => 'resident04',
            ],
            [
                'first_name' => 'Ella',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000005',
                'role' => 'Resident',
                'password' => 'resident05',
            ],

            [
                'first_name' => 'Fiona',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09190000006',
                'role' => 'Resident',
                'password' => 'resident06',
            ],

            [
                'first_name' => 'Grace',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000007',
                'role' => 'Resident',
                'password' => 'resident07',
            ],

            [
                'first_name' => 'Hannah',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09190000008',
                'role' => 'Resident',
                'password' => 'resident08',
            ],

            [
                'first_name' => 'Ivy',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000009',
                'role' => 'Resident',
                'password' => 'resident09',
            ],

            [
                'first_name' => 'Jane',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000010',
                'role' => 'Resident',
                'password' => 'resident10',
            ]
        ];

        // =====================
        // 💾 INSERT DATA
        // =====================
        foreach ($users as $data) {

            // 🔥 generate PR-000001 style
            $last = User::latest('id')->first();

            $next = $last
                ? (int) str_replace('PR-', '', $last->user_code) + 1
                : 1;

            $pr = 'PR-' . str_pad($next, 6, '0', STR_PAD_LEFT);

            User::create([
                'user_code' => $pr,
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'middle_name' => $data['middle_name'],
                'contact_number' => $data['contact_number'],
                'role' => $data['role'],
                'password' => Hash::make($data['password']),
            ]);
        }
    }
}

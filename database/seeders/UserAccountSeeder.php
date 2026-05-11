<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Account;
use Illuminate\Support\Facades\Hash;

class UserAccountSeeder extends Seeder
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
                'username' => 'staff01',
                'password' => 'staff01',
            ],
            [
                'first_name' => 'Maria',
                'last_name' => 'Reyes',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000002',
                'role' => 'Staff',
                'username' => 'staff02',
                'password' => 'staff02',
            ],
            [
                'first_name' => 'Carlos',
                'last_name' => 'Dela Cruz',
                'middle_name' => 'Santos',
                'contact_number' => '09180000003',
                'role' => 'Staff',
                'username' => 'staff03',
                'password' => 'staff03',
            ],
            [
                'first_name' => 'Anna',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000004',
                'role' => 'Staff',
                'username' => 'staff04',
                'password' => 'staff04',
            ],
            [
                'first_name' => 'Mark',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000005',
                'role' => 'Staff',
                'username' => 'staff05',
                'password' => 'staff05',
            ],
            [
                'first_name' => 'John',
                'last_name' => 'Cruz',
                'middle_name' => 'Ramos',
                'contact_number' => '09180000006',
                'role' => 'Staff',
                'username' => 'staff06',
                'password' => 'staff06',
            ],
            [
                'first_name' => 'Paul',
                'last_name' => 'Mendoza',
                'middle_name' => 'Torres',
                'contact_number' => '09180000007',
                'role' => 'Staff',
                'username' => 'staff07',
                'password' => 'staff07',
            ],
            [
                'first_name' => 'Luke',
                'last_name' => 'Torres',
                'middle_name' => 'Reyes',
                'contact_number' => '09180000008',
                'role' => 'Staff',
                'username' => 'staff08',
                'password' => 'staff08',
            ],
            [
                'first_name' => 'James',
                'last_name' => 'Ramos',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000009',
                'role' => 'Staff',
                'username' => 'staff09',
                'password' => 'staff09',
            ],
            [
                'first_name' => 'Peter',
                'last_name' => 'Fernandez',
                'middle_name' => 'Santos',
                'contact_number' => '09180000010',
                'role' => 'Staff',
                'username' => 'staff10',
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
                'username' => 'resident01',
                'password' => 'resident01',
            ],
            [
                'first_name' => 'Bea',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000002',
                'role' => 'Resident',
                'username' => 'resident02',
                'password' => 'resident02',
            ],
            [
                'first_name' => 'Cathy',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09190000003',
                'role' => 'Resident',
                'username' => 'resident03',
                'password' => 'resident03',
            ],
            [
                'first_name' => 'Diana',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000004',
                'role' => 'Resident',
                'username' => 'resident04',
                'password' => 'resident04',
            ],
            [
                'first_name' => 'Ella',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000005',
                'role' => 'Resident',
                'username' => 'resident05',
                'password' => 'resident05',
            ],
            [
                'first_name' => 'Fiona',
                'last_name' => 'Dela Cruz',
                'middle_name' => 'Ramos',
                'contact_number' => '09190000006',
                'role' => 'Resident',
                'username' => 'resident06',
                'password' => 'resident06',
            ],
            [
                'first_name' => 'Grace',
                'last_name' => 'Torres',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000007',
                'role' => 'Resident',
                'username' => 'resident07',
                'password' => 'resident07',
            ],
            [
                'first_name' => 'Hannah',
                'last_name' => 'Ramos',
                'middle_name' => 'Santos',
                'contact_number' => '09190000008',
                'role' => 'Resident',
                'username' => 'resident08',
                'password' => 'resident08',
            ],
            [
                'first_name' => 'Ivy',
                'last_name' => 'Mendoza',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000009',
                'role' => 'Resident',
                'username' => 'resident09',
                'password' => 'resident09',
            ],
            [
                'first_name' => 'Joy',
                'last_name' => 'Cruz',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000010',
                'role' => 'Resident',
                'username' => 'resident10',
                'password' => 'resident10',
            ],
        ];

        // =====================
        // 💾 INSERT DATA
        // =====================
        foreach ($users as $data) {

            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'middle_name' => $data['middle_name'], // ✔ ALWAYS HAS VALUE NOW
                'contact_number' => $data['contact_number'],
                'role' => $data['role'],
            ]);

            Account::create([
                'user_id' => $user->id,
                'username' => $data['username'],
                'password' => Hash::make($data['password']),
            ]);
        }
    }
}

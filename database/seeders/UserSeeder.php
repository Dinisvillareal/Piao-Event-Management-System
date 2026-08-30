<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\CivilStatus;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [

            // =========================
            // 🔵 STAFF (10)
            // =========================
            [
                'first_name' => 'Juan',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09180000001',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'staff123',
            ],
            [
                'first_name' => 'Maria',
                'last_name' => 'Reyes',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000002',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'maria123',
            ],
            [
                'first_name' => 'Carlos',
                'last_name' => 'Dela Cruz',
                'middle_name' => 'Santos',
                'contact_number' => '09180000003',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'carlos123',
            ],
            [
                'first_name' => 'Anna',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000004',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'anna123',
            ],
            [
                'first_name' => 'Mark',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000005',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'mark123',
            ],
            [
                'first_name' => 'Lisa',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09180000006',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'lisa123',
            ],
            [
                'first_name' => 'Tom',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000007',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'tom123',
            ],
            [
                'first_name' => 'Sara',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09180000008',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'sara123',
            ],
            [
                'first_name' => 'David',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000009',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'david123',
            ],
            [
                'first_name' => 'Emily',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000010',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'emily123',
            ],

            // =========================
            // 🟢 RESIDENTS (10)
            // =========================
            [
                'first_name' => 'Ana',
                'last_name' => 'Santiago',
                'middle_name' => 'Dela',
                'contact_number' => '09190000001',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'ana123',
                // Adviser example (Senior Citizen eligibility) demo resident
                'birth_date' => '1955-05-10',
                'civil_status' => 'Widowed',
            ],
            [
                'first_name' => 'Bea',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000002',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'bea123',
                // Solo Parent ("single mom") demo resident
                'birth_date' => '1992-03-22',
                'civil_status' => 'Solo Parent',
            ],
            [
                'first_name' => 'Cathy',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09190000003',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'cathy123',
                // Youth demo resident
                'birth_date' => '2010-09-14',
                'civil_status' => 'Single',
            ],
            [
                'first_name' => 'Diana',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000004',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'diana123',
            ],
            [
                'first_name' => 'Ella',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000005',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'ella123',
            ],
            [
                'first_name' => 'Fiona',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09190000006',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'fiona123',
            ],
            [
                'first_name' => 'Grace',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000007',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'grace123',
            ],
            [
                'first_name' => 'Hannah',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09190000008',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'hannah123',
            ],
            [
                'first_name' => 'Ivy',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000009',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'ivy123',
            ],
            [
                'first_name' => 'Jane',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000010',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'jane123',
            ],
        ];

        $next = User::withTrashed()->count() + 1;

        $civilStatusIds = CivilStatus::pluck('id', 'label');

        foreach ($users as $data) {

            $userCode = 'PR-' . str_pad($next, 4, '0', STR_PAD_LEFT);

            User::create([
                'user_code' => $userCode,
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'middle_name' => $data['middle_name'],
                'contact_number' => $data['contact_number'],

                // no ftp upload in seeder
                'validation_id' => null,

                'role' => $data['role'],

                // always predefined password
                'password' => Hash::make($data['password']),

                // DO NOT AUTO CHANGE
                'has_account' => $data['has_account'],

                // Adviser example (Senior Citizen eligibility) extended to
                // Youth / Solo Parent -- only set for the demo residents above.
                'birth_date' => $data['birth_date'] ?? null,
                'civil_status_id' => isset($data['civil_status']) ? ($civilStatusIds[$data['civil_status']] ?? null) : null,
            ]);

            $next++;
        }
    }
}

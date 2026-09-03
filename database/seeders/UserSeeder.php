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
            // STAFF (10)
            // =========================
            [
                'first_name' => 'Juan',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09180000001',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'staff123',
                'birth_date' => '1985-04-12',
                'civil_status' => 'Married',
                'gender' => 'Male',
            ],
            [
                'first_name' => 'Maria',
                'last_name' => 'Bautista',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000002',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'maria123',
                'birth_date' => '1990-07-03',
                'civil_status' => 'Married',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Carlos',
                'last_name' => 'Villanueva',
                'middle_name' => 'Santos',
                'contact_number' => '09180000003',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'carlos123',
                'birth_date' => '1978-11-25',
                'civil_status' => 'Married',
                'gender' => 'Male',
            ],
            [
                'first_name' => 'Anna',
                'last_name' => 'Mendoza',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000004',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'anna123',
                'birth_date' => '1995-02-18',
                'civil_status' => 'Single',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Mark',
                'last_name' => 'Aquino',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000005',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'mark123',
                'birth_date' => '1988-09-30',
                'civil_status' => 'Single',
                'gender' => 'Male',
            ],
            [
                'first_name' => 'Lisa',
                'last_name' => 'Torres',
                'middle_name' => 'Dela',
                'contact_number' => '09180000006',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'lisa123',
                'birth_date' => '1992-06-14',
                'civil_status' => 'Widowed',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Tom',
                'last_name' => 'Fernandez',
                'middle_name' => 'Lopez',
                'contact_number' => '09180000007',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'tom123',
                'birth_date' => '1983-01-09',
                'civil_status' => 'Married',
                'gender' => 'Male',
            ],
            [
                'first_name' => 'Sara',
                'last_name' => 'Ramos',
                'middle_name' => 'Santos',
                'contact_number' => '09180000008',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'sara123',
                'birth_date' => '1997-12-05',
                'civil_status' => 'Single',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'David',
                'last_name' => 'Castro',
                'middle_name' => 'Garcia',
                'contact_number' => '09180000009',
                'role' => 'Staff',
                'has_account' => 1,
                'password' => 'david123',
                'birth_date' => '1975-03-22',
                'civil_status' => 'Married',
                'gender' => 'Male',
            ],
            [
                'first_name' => 'Emily',
                'last_name' => 'Rivera',
                'middle_name' => 'Cruz',
                'contact_number' => '09180000010',
                'role' => 'Staff',
                'has_account' => 0,
                'password' => 'emily123',
                'birth_date' => '1991-08-17',
                'civil_status' => 'Solo Parent',
                'gender' => 'Female',
            ],

            // =========================
            // RESIDENTS (10)
            // =========================
            // NOTE: first_name/last_name below are matched by exact string
            // in HouseholdSeeder (household grouping) -- do not rename
            // without updating that seeder too.
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
                'gender' => 'Female',
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
                'gender' => 'Female',
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
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Diana',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000004',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'diana123',
                'birth_date' => '2005-06-15',
                'civil_status' => 'Single',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Ella',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000005',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'ella123',
                'birth_date' => '2012-01-08',
                'civil_status' => 'Single',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Fiona',
                'last_name' => 'Santos',
                'middle_name' => 'Dela',
                'contact_number' => '09190000006',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'fiona123',
                // Senior Citizen -- keep 60+ (enrolled in Senior Citizen
                // Program via MembershipResidentSeeder membership_id 3)
                'birth_date' => '1958-05-20',
                'civil_status' => 'Widowed',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Grace',
                'last_name' => 'Navarro',
                'middle_name' => 'Lopez',
                'contact_number' => '09190000007',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'grace123',
                // Solo Parent -- enrolled in Solo Parent Support via
                // MembershipResidentSeeder membership_id 5
                'birth_date' => '1987-03-11',
                'civil_status' => 'Solo Parent',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Hannah',
                'last_name' => 'Reyes',
                'middle_name' => 'Santos',
                'contact_number' => '09190000008',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'hannah123',
                'birth_date' => '1999-11-30',
                'civil_status' => 'Married',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Ivy',
                'last_name' => 'Lopez',
                'middle_name' => 'Garcia',
                'contact_number' => '09190000009',
                'role' => 'Resident',
                'has_account' => 1,
                'password' => 'ivy123',
                'birth_date' => '2001-09-09',
                'civil_status' => 'Single',
                'gender' => 'Female',
            ],
            [
                'first_name' => 'Jane',
                'last_name' => 'Garcia',
                'middle_name' => 'Cruz',
                'contact_number' => '09190000010',
                'role' => 'Resident',
                'has_account' => 0,
                'password' => 'jane123',
                // Senior Citizen -- keep 60+ (enrolled in Senior Citizen
                // Program via MembershipResidentSeeder membership_id 3)
                'birth_date' => '1961-10-02',
                'civil_status' => 'Married',
                'gender' => 'Female',
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
                // Youth / Solo Parent / Gender -- every seeded user now
                // carries these so the Residents table isn't full of
                // blank age/status/gender columns.
                'birth_date' => $data['birth_date'] ?? null,
                'civil_status_id' => isset($data['civil_status']) ? ($civilStatusIds[$data['civil_status']] ?? null) : null,
                'gender' => $data['gender'] ?? null,
            ]);

            $next++;
        }
    }
}

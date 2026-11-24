<?php

namespace Database\Seeders;

use App\Models\AgeBracket;
use App\Models\CivilStatus;
use App\Models\CurrentStatus;
use App\Models\Membership;
use App\Models\MembershipResident;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds ONLY the people of the Barangay Piao demo (same people as HumanDemoSeeder), and nothing else:
 *
 *   the 10 people     Barangay Captain, Barangay Secretary (Head Staff), 2 Barangay Staff, 6 residents
 *   their password    Piao@2026 (every person)
 *   what they need    the age / civil / current status lists and the 5 memberships they belong to
 *
 * No events, inventory, budget, households, feedback, attendance, notifications or activity log.
 *
 * Use it on an EMPTY database (user codes start at PR-0001):
 *
 *     php artisan migrate:fresh
 *     php artisan db:seed --class=HumanPeopleSeeder
 *
 * Do not run it through DatabaseSeeder: that one turns model events off.
 */
class HumanPeopleSeeder extends Seeder
{
    private const PASSWORD = 'Piao@2026';

    public function run(): void
    {
        if (User::withTrashed()->where('first_name', 'Teresita')->where('last_name', 'Bautista')->exists()) {
            $this->command?->warn('These people are already in this database. Use an empty one (php artisan migrate:fresh).');
            return;
        }

        // the system's own lists
        $this->call([AgeBracketSeeder::class, CivilStatusSeeder::class, CurrentStatusSeeder::class]);

        // same five current statuses as the full demo
        $keep = ['Employed' => 1, 'Self-employed' => 2, 'Unemployed' => 3, 'Student' => 4, 'Retired' => 5];
        CurrentStatus::withTrashed()->whereNotIn('label', array_keys($keep))->forceDelete();
        foreach ($keep as $label => $order) {
            CurrentStatus::where('label', $label)->update(['sort_order' => $order]);
        }
        CurrentStatus::forgetCache();

        $memberships = $this->memberships();
        $people = $this->people($memberships);

        // this barangay does not use the Child age group (archived, same as the full demo)
        $child = AgeBracket::where('label', 'Child')->first();
        if ($child) {
            $child->forceFill(['deleted_by' => $people['head']->user_code])->save();
            $child->delete();
            AgeBracket::forgetCache();
        }

        $rows = collect($people['all'])->map(fn ($u) => [
            $u->user_code,
            trim($u->first_name . ' ' . $u->last_name),
            $u->role,
            $u->has_account ? 1 : 0,
            Hash::check(self::PASSWORD, (string) $u->getRawOriginal('password')) ? self::PASSWORD : 'no password',
        ])->all();

        $this->command?->table(['user_code', 'name', 'role', 'has_account', 'password'], $rows);
        $this->command?->info(count($rows) . ' people seeded.');
    }

    // ------------------------------------------------------------------ memberships

    private function memberships(): array
    {
        $senior = AgeBracket::where('label', 'Senior Citizen')->value('id');

        $m = [];
        $m['pantawid'] = Membership::create([
            'name' => 'Pantawid Pamilya (4Ps)',
            'description' => 'Monthly cash help for poor families, so the children can go to school and get their regular check-ups.',
        ]);
        $m['gutom'] = Membership::create([
            'name' => 'Walang Gutom',
            'description' => 'Monthly food help for families who often go hungry, so there is always rice and food on the table.',
        ]);
        $m['senior'] = Membership::create([
            'name' => 'Senior Citizen',
            'description' => 'For lolos and lolas aged 60 and above: social pension, discounts, and regular health check-ups.',
        ]);
        if ($senior) {
            $m['senior']->eligibleAgeBrackets()->sync([$senior]);
        }
        $m['pwd'] = Membership::create([
            'name' => 'PWD Assistance',
            'description' => 'Help for persons with disability: medical support, discounts, and livelihood chances.',
        ]);
        $m['solo'] = Membership::create([
            'name' => 'Solo Parent',
            'description' => 'Help for parents raising their children alone: benefits, school support, and livelihood training.',
        ]);

        return $m;
    }

    // ------------------------------------------------------------------ people

    private function people(array $m): array
    {
        $civil = CivilStatus::pluck('id', 'label');
        $current = CurrentStatus::pluck('id', 'label');

        // first, middle, last, gender, birth date, civil status, contact, purok, role, memberships, current statuses
        $rows = [
            // --- the barangay's own people: the Secretary (also the Head Staff) first, then the two staff ---
            ['Teresita', 'Ramos', 'Bautista', 'Female', '1979-03-14', 'Married', '09171230001', 1, 'Staff', [], ['Employed']],   // Barangay Secretary + Head Staff
            ['Ramon', 'Santos', 'Dela Cruz', 'Male', '1984-08-22', 'Married', '09171230002', 2, 'Staff', [], ['Employed']],      // Barangay Staff
            ['Liza', 'Garcia', 'Aguilar', 'Female', '1992-01-09', 'Single', '09171230003', 1, 'Staff', [], ['Employed']],        // Barangay Staff (Pedro Aguilar's daughter)

            // --- the Barangay Captain: a resident record that holds the captain's post (no login: the captain
            //     reads the staff's paper reports, he does not use the system himself) ---
            ['Librado', 'Tanoc', 'Magcanta', 'Male', '1976-06-12', 'Married', '09171230010', 1, 'Resident', [], ['Self-employed'], 'captain', 'Jr.'],   // Hon. Librado T. Magcanta, Jr., 50 years old

            // --- residents ---
            ['Rosario', 'Cruz', 'Villanueva', 'Female', '1988-05-17', 'Married', '09181230001', 3, 'Resident', ['pantawid', 'gutom'], ['Self-employed', '4Ps Beneficiary', 'Indigent']],
            ['Marites', 'Lopez', 'Soriano', 'Female', '1985-02-26', 'Widowed', '09181230003', 5, 'Resident', ['pantawid', 'solo'], ['Employed', 'Solo Parent', '4Ps Beneficiary']],
            ['Nenita', 'Torres', 'Alcantara', 'Female', '1980-06-30', 'Married', '09181230005', 4, 'Resident', ['gutom'], ['Unemployed', 'Indigent']],
            ['Pedro', 'Dimagiba', 'Aguilar', 'Male', '1955-01-20', 'Married', '09181230006', 1, 'Resident', ['senior'], ['Retired']],
            ['Cresencia', 'Bernardo', 'Macaraeg', 'Female', '1949-09-08', 'Widowed', '09181230007', 4, 'Resident', ['senior', 'gutom'], ['Retired', 'Indigent']],
            ['Danilo', 'Peralta', 'Mercado', 'Male', '1975-04-05', 'Married', '09181230009', 6, 'Resident', ['pwd'], ['Self-employed', 'Person with Disability (PWD)']],
        ];

        $next = User::withTrashed()->count() + 1;
        $staff = [];
        $all = [];
        $head = null;

        foreach ($rows as $row) {
            [$first, $middle, $last, $gender, $birth, $civilLabel, $phone, $purok, $role, $memberKeys, $statuses] = $row;
            $position = $row[11] ?? null; // 'captain' for the Barangay Captain
            $suffix = $row[12] ?? null;   // Jr., Sr. ...
            $user = User::create([
                'user_code' => 'PR-' . str_pad($next++, 4, '0', STR_PAD_LEFT),
                'first_name' => $first,
                'middle_name' => $middle,
                'last_name' => $last,
                'suffix' => $suffix,
                'contact_number' => $phone,
                'role' => $role,
                'password' => Hash::make(self::PASSWORD),
                'has_account' => $role === 'Staff' ? 1 : 0,
                'birth_date' => $birth,
                'civil_status_id' => $civil[$civilLabel] ?? null,
                'gender' => $gender,
                'address' => "Purok {$purok}, Barangay Piao",
                'barangay_position' => $position ?? ($head === null && $role === 'Staff' ? 'secretary' : null),
            ]);

            // Two residents use the Member Portal, in Bisaya (the only residents who can leave feedback)
            if ($role === 'Resident' && in_array($first, ['Rosario', 'Nenita'], true)) {
                $user->forceFill(['has_account' => 1, 'preferred_language' => 'ceb'])->save();
            }

            $all[] = $user;
            if ($role === 'Staff') {
                $staff[] = $user;
                if ($head === null) {
                    // the Barangay Secretary is the Head Staff
                    $head = $user;
                    $user->forceFill(['is_head_staff' => true])->save();
                }
            }

            foreach ($memberKeys as $key) {
                MembershipResident::create(['user_id' => $user->id, 'membership_id' => $m[$key]->id]);
            }

            $ids = collect($statuses)->map(fn ($label) => $current[$label] ?? null)->filter()->values();
            if ($ids->isNotEmpty()) {
                $user->currentStatuses()->attach($ids);
            }
        }

        return ['staff' => $staff, 'head' => $head, 'all' => $all];
    }
}

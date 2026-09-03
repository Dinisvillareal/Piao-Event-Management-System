<?php

namespace Database\Seeders;

use App\Models\Household;
use App\Models\User;
use Illuminate\Database\Seeder;

class HouseholdSeeder extends Seeder
{
    /**
     * Groups the demo residents into realistic households using the new
     * Household module -- the same last name is used across a couple of
     * seeded residents specifically so they can be grouped into a family.
     *
     * A couple of residents are deliberately left on the *old* free-text
     * household_code (no household_id / no households row), and one
     * household is deliberately left without a designated head, so all
     * three SmsService::notifyHouseholds() grouping paths -- household_id,
     * legacy household_code string match, and the "no head, text everyone"
     * fallback -- have real seeded data to exercise.
     */
    public function run(): void
    {
        $groups = [
            [
                'members' => ['Bea Navarro', 'Grace Navarro'],
                'head' => 'Bea Navarro',
                'address' => 'Purok 3, Barangay Piao',
                'contact_number' => '09190000002',
            ],
            [
                'members' => ['Cathy Reyes', 'Hannah Reyes'],
                'head' => 'Cathy Reyes',
                'address' => 'Purok 5, Barangay Piao',
                'contact_number' => '09190000003',
            ],
            [
                'members' => ['Diana Lopez', 'Ivy Lopez'],
                'head' => 'Diana Lopez',
                'address' => 'Purok 1, Barangay Piao',
                'contact_number' => '09190000004',
            ],
            [
                // Deliberately no head -- exercises the "no head, text every
                // member individually" fallback in notifyHouseholds().
                'members' => ['Ella Garcia', 'Jane Garcia'],
                'head' => null,
                'address' => 'Purok 7, Barangay Piao',
                'contact_number' => null,
            ],
        ];

        foreach ($groups as $group) {
            $household = Household::create([
                'code' => Household::generateCode(),
                'address' => $group['address'],
                'contact_number' => $group['contact_number'],
            ]);

            foreach ($group['members'] as $fullName) {
                [$first, $last] = explode(' ', $fullName, 2);
                $user = User::withTrashed()
                    ->where('first_name', $first)
                    ->where('last_name', $last)
                    ->first();

                if (!$user) {
                    continue;
                }

                $user->household_id = $household->id;
                $user->is_household_head = ($group['head'] === $fullName);
                $user->save();
            }
        }

        // Legacy free-text household_code pair (Ana Santiago + Fiona Santos)
        // -- intentionally NOT given a household_id / households row, so
        // this exercises the old string-matching grouping path instead.
        User::withTrashed()
            ->where(function ($q) {
                $q->where(function ($q2) {
                    $q2->where('first_name', 'Ana')->where('last_name', 'Santiago');
                })->orWhere(function ($q2) {
                    $q2->where('first_name', 'Fiona')->where('last_name', 'Santos');
                });
            })
            ->get()
            ->each(function (User $user) {
                $user->household_code = 'LEGACY-01';
                $user->household_contact_number = $user->first_name === 'Ana' ? '09190000001' : null;
                $user->is_household_head = $user->first_name === 'Ana';
                $user->save();
            });
    }
}

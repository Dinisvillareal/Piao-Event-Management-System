<?php

namespace Database\Seeders;

use App\Models\Household;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * Who lives with whom in Barangay Piao: two households, so there are only TWO household heads to test with.
 *
 *   HH-0001  Pedro Aguilar (head), Liza, Marites, Danilo   - Purok 1
 *   HH-0002  Nenita Alcantara (head, has an account), Cresencia, Rosario (has an account) - Purok 4
 *
 * The Barangay Captain, the Secretary and the other Staff are officials and have no household.
 * A household has a code, one head, the address and the SMS number of the head (the number the
 * barangay texts). Needs HumanDemoSeeder's people (HumanDemoSeeder calls this seeder itself).
 *
 *     php artisan db:seed --class=HumanHouseholdSeeder
 */
class HumanHouseholdSeeder extends Seeder
{
    /** [head's first name, [other members' first names], address, the head's SMS number, what kind of household] */
    private const HOUSEHOLDS = [
        ['Pedro', ['Liza', 'Marites', 'Danilo'], 'Purok 1, Barangay Piao', '09181230006', 'Lolo Pedro with his daughter, granddaughter and nephew'],
        ['Nenita', ['Cresencia', 'Rosario'], 'Purok 4, Barangay Piao', '09181230005', 'Nenita with her mother (Lola Cresing) and her sister'],
    ];


    public function run(): void
    {
        $rows = [];

        foreach (self::HOUSEHOLDS as [$headName, $memberNames, $address, $contact, $kind]) {
            $head = User::where('first_name', $headName)->first();
            if (!$head || $head->household_id) {
                continue; // person missing, or already has a household
            }

            $household = Household::create([
                'code' => Household::generateCode(),
                'address' => $address,
                'contact_number' => $contact,
            ]);

            $secretary = DemoLog::head();
            $when = Carbon::parse('2026-11-10 10:30:00')->addMinutes(count($rows) * 20);   // the Secretary registers them one household at a time
            DemoLog::write($secretary?->user_code, 'Create', 'Households', "Created household '{$household->code}'", $when);

            $members = [];
            foreach (array_merge([$headName], $memberNames) as $first) {
                $user = $first === $headName ? $head : User::where('first_name', $first)->whereNull('household_id')->first();
                if (!$user) {
                    continue;
                }
                $user->forceFill([
                    'household_id' => $household->id,
                    'is_household_head' => $first === $headName,
                    'address' => $address,
                ])->save();
                $members[] = $first === $headName ? $first . ' (head)' : $first;

                $when = $when->copy()->addMinutes(2);
                $full = DemoLog::name($user);
                DemoLog::write($secretary?->user_code, 'Update', 'Households', "Added {$full} to household '{$household->code}'", $when);
                if ($first === $headName) {
                    DemoLog::write($secretary?->user_code, 'Update', 'Households', "Set {$full} as head of household '{$household->code}'", $when->copy()->addMinute());
                }
            }

            $rows[] = [$household->code, implode(', ', $members), $address, $contact, $kind];
        }

        if ($rows) {
            $this->command?->newLine();
            $this->command?->table(['Household', 'Members', 'Address', 'SMS number', 'Kind'], $rows);
        }
    }
}

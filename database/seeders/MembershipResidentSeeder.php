<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\MembershipResident;

class MembershipResidentSeeder extends Seeder
{
    public function run(): void
    {
        $data = [

            ['user_id' => 11, 'membership_id' => 1],
            ['user_id' => 11, 'membership_id' => 2],
            ['user_id' => 11, 'membership_id' => 3],

            ['user_id' => 12, 'membership_id' => 4],
            ['user_id' => 12, 'membership_id' => 5],

            ['user_id' => 13, 'membership_id' => 6],
            ['user_id' => 13, 'membership_id' => 7],
            ['user_id' => 13, 'membership_id' => 8],

            ['user_id' => 14, 'membership_id' => 9],

            ['user_id' => 15, 'membership_id' => 10],
            ['user_id' => 15, 'membership_id' => 1],

            ['user_id' => 16, 'membership_id' => 2],
            ['user_id' => 16, 'membership_id' => 3],

            ['user_id' => 17, 'membership_id' => 4],
            ['user_id' => 17, 'membership_id' => 5],
            ['user_id' => 17, 'membership_id' => 6],

            ['user_id' => 18, 'membership_id' => 7],
            ['user_id' => 18, 'membership_id' => 8],

            ['user_id' => 19, 'membership_id' => 9],
            ['user_id' => 19, 'membership_id' => 10],

            ['user_id' => 20, 'membership_id' => 1],
            ['user_id' => 20, 'membership_id' => 2],
            ['user_id' => 20, 'membership_id' => 3],
        ];

        foreach ($data as $item) {

            MembershipResident::create($item);
        }
    }
}

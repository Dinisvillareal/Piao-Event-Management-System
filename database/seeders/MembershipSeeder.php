<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class MembershipSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('memberships')->insert([
            ['name' => 'Pantawid Pamilya'],
            ['name' => 'Walang Gutom'],
        ]);
    }
}

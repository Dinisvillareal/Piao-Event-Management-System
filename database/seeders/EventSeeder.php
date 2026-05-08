<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Event;
use Carbon\Carbon;

class EventSeeder extends Seeder
{
    public function run(): void
    {
        Event::insert([
            [
                'name' => 'Barangay Clean-Up Drive',
                'description' => 'Community clean-up activity in main streets and public areas.',
                'event_start' => Carbon::create('2026', '05', '10', '07', '00', '00'),
                'event_end' => Carbon::create('2026', '05', '10', '11', '00', '00'),
                
            ],
            [
                'name' => 'Health & Medical Mission',
                'description' => 'Free medical check-up and consultation for residents.',
                'event_start' => Carbon::create('2026', '05', '15', '08', '00', '00'),
                'event_end' => Carbon::create('2026', '05', '15', '16', '00', '00'),
                
            ],
            [
                'name' => 'Barangay Assembly Meeting',
                'description' => 'Monthly meeting for barangay updates and concerns.',
                'event_start' => Carbon::create('2026', '05', '20', '18', '00', '00'),
                'event_end' => Carbon::create('2026', '05', '20', '20', '00', '00'),
              
            ],
            [
                'name' => 'Sports Fest Opening',
                'description' => 'Opening ceremony of barangay sports festival.',
                'event_start' => Carbon::create('2026', '05', '25', '09', '00', '00'),
                'event_end' => Carbon::create('2026', '05', '25', '12', '00', '00'),
               
            ],
            [
                'name' => 'Tree Planting Activity',
                'description' => 'Environmental protection activity with residents and youth.',
                'event_start' => Carbon::create('2026', '05', '30', '06', '00', '00'),
                'event_end' => Carbon::create('2026', '05', '30', '10', '00', '00'),
                
            ],
        ]);
    }
}
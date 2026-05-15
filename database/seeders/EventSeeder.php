<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Event;

class EventSeeder extends Seeder
{
    public function run(): void
    {
        $events = [
            [
                'name' => 'Barangay Clean-Up Drive',
                'description' => 'Community clean-up activity in main streets and public areas.',
                'location' => 'Barangay Hall',
                'event_start' => '2026-05-10 07:00:00',
                'event_end' => '2026-05-10 11:00:00',
            ],
            [
                'name' => 'Health & Medical Mission',
                'description' => 'Free medical check-up and consultation for residents.',
                'location' => 'Barangay Gymnasium',
                'event_start' => '2026-05-15 08:00:00',
                'event_end' => '2026-05-15 16:00:00',
            ],
            [
                'name' => 'Barangay Assembly Meeting',
                'description' => 'Monthly meeting for barangay updates and concerns.',
                'location' => 'Barangay Hall',
                'event_start' => '2026-05-20 18:00:00',
                'event_end' => '2026-05-20 20:00:00',
            ],
            [
                'name' => 'Sports Fest Opening',
                'description' => 'Opening ceremony of barangay sports festival.',
                'location' => 'Barangay Sports Complex',
                'event_start' => '2026-05-25 09:00:00',
                'event_end' => '2026-05-25 12:00:00',
            ],
            [
                'name' => 'Tree Planting Activity',
                'description' => 'Environmental protection activity with residents and youth.',
                'location' => 'Barangay Park',
                'event_start' => '2026-05-30 06:00:00',
                'event_end' => '2026-05-30 10:00:00',
            ],
            [
                'name' => 'Youth Leadership Training',
                'description' => 'Training program for youth leaders in the barangay.',
                'location' => 'Barangay Hall',
                'event_start' => '2026-06-02 09:00:00',
                'event_end' => '2026-06-02 15:00:00',
            ],
            [
                'name' => 'Fire Safety Awareness Seminar',
                'description' => 'Seminar about fire prevention and emergency response.',
                'location' => 'Barangay Gymnasium',
                'event_start' => '2026-06-05 10:00:00',
                'event_end' => '2026-06-05 12:00:00',
            ],
            [
                'name' => 'Blood Donation Drive',
                'description' => 'Voluntary blood donation for hospitals in need.',
                'location' => 'Barangay Health Center',
                'event_start' => '2026-06-08 08:00:00',
                'event_end' => '2026-06-08 14:00:00',
            ],
            [
                'name' => 'Summer Basketball League',
                'description' => 'Inter-barangay basketball tournament.',
                'location' => 'Barangay Sports Complex',
                'event_start' => '2026-06-12 16:00:00',
                'event_end' => '2026-06-12 20:00:00',
            ],
            [
                'name' => 'Community Feeding Program',
                'description' => 'Free meals for children and elderly residents.',
                'location' => 'Barangay Hall',
                'event_start' => '2026-06-15 09:00:00',
                'event_end' => '2026-06-15 12:00:00',
            ],
        ];

        foreach ($events as $event) {
            Event::create($event);
        }
    }
}
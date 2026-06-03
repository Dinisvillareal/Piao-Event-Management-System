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
                'description' => 'Community clean-up activity for all residents to keep our barangay streets and parks tidy.',
                'location' => 'Barangay Hall',
                'membership_ids' => [], // Open to all (ONLY open event)
                'event_start' => '2026-06-03 07:00:00',
                'event_end' => '2026-06-03 11:00:00',
            ],
            [
                'name' => 'Senior Citizen Wellness Check',
                'description' => 'Health screening and support services for senior citizen members.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [3],
                'event_start' => '2026-06-05 08:00:00',
                'event_end' => '2026-06-05 11:00:00',
            ],
            [
                'name' => 'Pantawid Pamilya Livelihood Workshop',
                'description' => 'Skills training and business planning for Pantawid Pamilya recipients.',
                'location' => 'Community Training Room',
                'membership_ids' => [1],
                'event_start' => '2026-06-08 09:00:00',
                'event_end' => '2026-06-08 15:00:00',
            ],
            [
                'name' => 'Barangay Assembly Meeting',
                'description' => 'Barangay assembly for community announcements and resident questions.',
                'location' => 'Barangay Hall',
                'membership_ids' => [3],
                'event_start' => '2026-06-10 18:00:00',
                'event_end' => '2026-06-10 20:00:00',
            ],
            [
                'name' => 'Walang Gutom Nutrition Seminar',
                'description' => 'Nutrition planning seminar for Walang Gutom beneficiaries.',
                'location' => 'Barangay Gymnasium',
                'membership_ids' => [2],
                'event_start' => '2026-06-12 10:00:00',
                'event_end' => '2026-06-12 13:00:00',
            ],
            [
                'name' => 'Community Feeding Program',
                'description' => 'Feeding program offering free meals to residents.',
                'location' => 'Barangay Hall',
                'membership_ids' => [1],
                'event_start' => '2026-06-14 09:00:00',
                'event_end' => '2026-06-14 12:00:00',
            ],
            [
                'name' => 'PWD Accessibility Forum',
                'description' => 'Accessibility and benefits discussion for PWD members.',
                'location' => 'Barangay Hall',
                'membership_ids' => [4],
                'event_start' => '2026-06-16 09:00:00',
                'event_end' => '2026-06-16 12:00:00',
            ],
            [
                'name' => 'Solo Parent Support Session',
                'description' => 'Support session and resource briefing for solo parent members.',
                'location' => 'Multi-Purpose Hall',
                'membership_ids' => [5],
                'event_start' => '2026-06-18 13:00:00',
                'event_end' => '2026-06-18 16:00:00',
            ],
            [
                'name' => 'PhilHealth Enrollment Assistance',
                'description' => 'Enrollment assistance for members of the Health Insurance Program.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-06-20 09:00:00',
                'event_end' => '2026-06-20 12:00:00',
            ],
            [
                'name' => 'Educational Grants Orientation',
                'description' => 'Scholarship and grant application support for Educational Assistance members.',
                'location' => 'Community Learning Center',
                'membership_ids' => [8],
                'event_start' => '2026-06-22 09:00:00',
                'event_end' => '2026-06-22 12:00:00',
            ],
            [
                'name' => 'Emergency Relief Planning',
                'description' => 'Disaster relief coordination for Emergency Relief Program members.',
                'location' => 'Barangay Assembly Hall',
                'membership_ids' => [10],
                'event_start' => '2026-06-25 10:00:00',
                'event_end' => '2026-06-25 13:00:00',
            ],
            [
                'name' => 'Livelihood Program Follow-Up',
                'description' => 'Follow-up workshop for current Livelihood Assistance members.',
                'location' => 'Training Room 2',
                'membership_ids' => [7],
                'event_start' => '2026-06-27 09:00:00',
                'event_end' => '2026-06-27 12:00:00',
            ],
            [
                'name' => 'Senior Citizen Art Therapy',
                'description' => 'Wellness and creative expression session tailored for senior citizen members.',
                'location' => 'Community Arts Center',
                'membership_ids' => [3],
                'event_start' => '2026-06-29 14:00:00',
                'event_end' => '2026-06-29 17:00:00',
            ],
            [
                'name' => 'Housing Repair Orientation',
                'description' => 'Home improvement planning and support for Housing Support members.',
                'location' => 'Barangay Multipurpose Hall',
                'membership_ids' => [9],
                'event_start' => '2026-07-01 09:00:00',
                'event_end' => '2026-07-01 12:00:00',
            ],
            [
                'name' => 'Health Insurance Claims Clinic',
                'description' => 'One-on-one assistance for Health Insurance Program members filing PhilHealth claims.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-07-05 08:30:00',
                'event_end' => '2026-07-05 11:30:00',
            ],
            [
                'name' => 'Senior Citizen Legal Aid Clinic',
                'description' => 'Legal aid and rights counseling for members of the Senior Citizen Program.',
                'location' => 'Barangay Legal Aid Office',
                'membership_ids' => [3],
                'event_start' => '2026-07-08 09:00:00',
                'event_end' => '2026-07-08 12:00:00',
            ],
            [
                'name' => 'Walang Gutom Food Budgeting Workshop',
                'description' => 'Practical budgeting tips and nutrition planning for Walang Gutom members.',
                'location' => 'Community Training Room',
                'membership_ids' => [2],
                'event_start' => '2026-07-10 10:00:00',
                'event_end' => '2026-07-10 13:00:00',
            ],
            [
                'name' => 'Housing Program Claim Assistance',
                'description' => 'Claim filing and documentation assistance for Housing Support members.',
                'location' => 'Barangay Hall Annex',
                'membership_ids' => [9],
                'event_start' => '2026-07-12 09:00:00',
                'event_end' => '2026-07-12 12:00:00',
            ],
            [
                'name' => 'Pantawid Pamilya Parent Education Seminar',
                'description' => 'Parent education and support seminar exclusively for Pantawid Pamilya members.',
                'location' => 'Multi-Purpose Hall',
                'membership_ids' => [1],
                'event_start' => '2026-07-14 13:00:00',
                'event_end' => '2026-07-14 16:00:00',
            ],
            [
                'name' => 'Livelihood Startup Pitch for Young Entrepreneurs',
                'description' => 'A pitch and mentoring event for Livelihood Assistance members.',
                'location' => 'Barangay Innovation Center',
                'membership_ids' => [7],
                'event_start' => '2026-07-16 09:00:00',
                'event_end' => '2026-07-16 12:00:00',
            ],
            [
                'name' => 'Solo Parent Legal Rights Briefing',
                'description' => 'Legal rights briefing and support services for members of the Solo Parent Support program.',
                'location' => 'Barangay Hall Conference Room',
                'membership_ids' => [5],
                'event_start' => '2026-07-18 10:00:00',
                'event_end' => '2026-07-18 12:00:00',
            ],
            [
                'name' => 'PWD Mobility Support Clinic',
                'description' => 'Mobility assessment and support service for members of the PWD Assistance program.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [4],
                'event_start' => '2026-07-20 09:00:00',
                'event_end' => '2026-07-20 11:00:00',
            ],
            [
                'name' => 'Educational Assistance Scholarship Preparation',
                'description' => 'Scholarship and grant preparation workshop for Educational Assistance members.',
                'location' => 'Community Learning Center',
                'membership_ids' => [8],
                'event_start' => '2026-07-22 13:00:00',
                'event_end' => '2026-07-22 15:00:00',
            ],
            [
                'name' => 'Emergency Relief Volunteer Training',
                'description' => 'Volunteer training session for Emergency Relief Program members to prepare for disaster response.',
                'location' => 'Barangay Assembly Hall',
                'membership_ids' => [10],
                'event_start' => '2026-07-24 08:00:00',
                'event_end' => '2026-07-24 11:00:00',
            ],
            [
                'name' => 'Pantawid Pamilya Health Awareness Day',
                'description' => 'Health awareness and prevention seminar for Pantawid Pamilya members.',
                'location' => 'Barangay Gymnasium',
                'membership_ids' => [1],
                'event_start' => '2026-07-26 09:00:00',
                'event_end' => '2026-07-26 12:00:00',
            ],
            [
                'name' => 'Health Insurance Family Wellness Check',
                'description' => 'Family wellness check-up session for Health Insurance Program members and their dependents.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-07-28 09:00:00',
                'event_end' => '2026-07-28 12:00:00',
            ],
        ];

        foreach ($events as $event) {
            Event::create($event);
        }
    }
}
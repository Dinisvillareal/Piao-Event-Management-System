<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;
use Carbon\Carbon;

class EventSeeder extends Seeder
{
    public function run(): void
    {
        // ✅ FIX: Get ALL users who have memberships (Residents AND Staff)
        $users = User::whereHas('memberships')->with('memberships')->get();
        
        if ($users->isEmpty()) {
            $this->command->warn('⚠️ No users with memberships found. Events will be created without notifications.');
        } else {
            $this->command->info("📋 Found " . $users->count() . " users with memberships");
        }

        $events = [
            [
                'name' => 'Barangay Clean-Up Drive',
                'description' => 'Community clean-up activity for all residents to keep our barangay streets and parks tidy.',
                'location' => 'Barangay Hall',
                'membership_ids' => [],
                'event_start' => '2026-06-03 07:00:00',
                'event_end' => '2026-06-03 11:00:00',
                'call_time_start' => '2026-06-03 06:00:00',
                'call_time_end' => '2026-06-03 11:30:00',
                'notification_message' => 'Bring your own gloves and face mask.',
                'approved_budget' => 4000.00,
            ],
            [
                'name' => 'Senior Citizen Wellness Check',
                'description' => 'Health screening and support services for senior citizen members.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [3],
                'event_start' => '2026-06-05 08:00:00',
                'event_end' => '2026-06-05 11:00:00',
                'call_time_start' => '2026-06-05 07:00:00',
                'call_time_end' => '2026-06-05 11:30:00',
                'notification_message' => 'Free health checkup for senior citizens.',
                'approved_budget' => 6000.00,
            ],
            [
                'name' => 'Pantawid Pamilya Livelihood Workshop',
                'description' => 'Skills training and business planning for Pantawid Pamilya recipients.',
                'location' => 'Community Training Room',
                'membership_ids' => [1],
                'event_start' => '2026-06-08 09:00:00',
                'event_end' => '2026-06-08 15:00:00',
                'call_time_start' => '2026-06-08 08:00:00',
                'call_time_end' => '2026-06-08 15:30:00',
                'notification_message' => 'Learn new skills for your livelihood.',
                'approved_budget' => 10000.00,
            ],
            [
                'name' => 'Barangay Assembly Meeting',
                'description' => 'Barangay assembly for community announcements and resident questions.',
                'location' => 'Barangay Hall',
                'membership_ids' => [3],
                'event_start' => '2026-06-10 18:00:00',
                'event_end' => '2026-06-10 20:00:00',
                'call_time_start' => '2026-06-10 17:00:00',
                'call_time_end' => '2026-06-10 20:30:00',
                'notification_message' => 'Your presence is important.',
                'approved_budget' => 4500.00,
            ],
            [
                'name' => 'Walang Gutom Nutrition Seminar',
                'description' => 'Nutrition planning seminar for Walang Gutom beneficiaries.',
                'location' => 'Barangay Gymnasium',
                'membership_ids' => [2],
                'event_start' => '2026-06-12 10:00:00',
                'event_end' => '2026-06-12 13:00:00',
                'call_time_start' => '2026-06-12 09:00:00',
                'call_time_end' => '2026-06-12 13:30:00',
                'notification_message' => 'Learn about proper nutrition.',
                'approved_budget' => 4200.00,
            ],
            [
                'name' => 'Community Feeding Program',
                'description' => 'Feeding program offering free meals to residents.',
                'location' => 'Barangay Hall',
                'membership_ids' => [1],
                'event_start' => '2026-06-14 09:00:00',
                'event_end' => '2026-06-14 12:00:00',
                'call_time_start' => '2026-06-14 08:00:00',
                'call_time_end' => '2026-06-14 12:30:00',
                'notification_message' => 'Free meals for beneficiaries.',
                'approved_budget' => 25000.00,
            ],
            [
                'name' => 'PWD Accessibility Forum',
                'description' => 'Accessibility and benefits discussion for PWD members.',
                'location' => 'Barangay Hall',
                'membership_ids' => [4],
                'event_start' => '2026-06-16 09:00:00',
                'event_end' => '2026-06-16 12:00:00',
                'call_time_start' => '2026-06-16 08:00:00',
                'call_time_end' => '2026-06-16 12:30:00',
                'notification_message' => 'Discuss accessibility improvements.',
                'approved_budget' => 5500.00,
            ],
            [
                'name' => 'Solo Parent Support Session',
                'description' => 'Support session and resource briefing for solo parent members.',
                'location' => 'Multi-Purpose Hall',
                'membership_ids' => [5],
                'event_start' => '2026-06-18 13:00:00',
                'event_end' => '2026-06-18 16:00:00',
                'call_time_start' => '2026-06-18 12:00:00',
                'call_time_end' => '2026-06-18 16:30:00',
                'notification_message' => 'Support for solo parents.',
                'approved_budget' => 4000.00,
            ],
            [
                'name' => 'PhilHealth Enrollment Assistance',
                'description' => 'Enrollment assistance for members of the Health Insurance Program.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-06-20 09:00:00',
                'event_end' => '2026-06-20 12:00:00',
                'call_time_start' => '2026-06-20 08:00:00',
                'call_time_end' => '2026-06-20 12:30:00',
                'notification_message' => 'Get help with PhilHealth.',
                'approved_budget' => 2200.00,
            ],
            [
                'name' => 'Educational Grants Orientation',
                'description' => 'Scholarship and grant application support for Educational Assistance members.',
                'location' => 'Community Learning Center',
                'membership_ids' => [8],
                'event_start' => '2026-06-22 09:00:00',
                'event_end' => '2026-06-22 12:00:00',
                'call_time_start' => '2026-06-22 08:00:00',
                'call_time_end' => '2026-06-22 12:30:00',
                'notification_message' => 'Scholarship opportunities available.',
                'approved_budget' => 5800.00,
            ],
            [
                'name' => 'Emergency Relief Planning',
                'description' => 'Disaster relief coordination for Emergency Relief Program members.',
                'location' => 'Barangay Assembly Hall',
                'membership_ids' => [10],
                'event_start' => '2026-06-25 10:00:00',
                'event_end' => '2026-06-25 13:00:00',
                'call_time_start' => '2026-06-25 09:00:00',
                'call_time_end' => '2026-06-25 13:30:00',
                'notification_message' => 'Emergency preparedness training.',
                'approved_budget' => 6000.00,
            ],
            [
                'name' => 'Livelihood Program Follow-Up',
                'description' => 'Follow-up workshop for current Livelihood Assistance members.',
                'location' => 'Training Room 2',
                'membership_ids' => [7],
                'event_start' => '2026-06-27 09:00:00',
                'event_end' => '2026-06-27 12:00:00',
                'call_time_start' => '2026-06-27 08:00:00',
                'call_time_end' => '2026-06-27 12:30:00',
                'notification_message' => 'Follow-up on your livelihood.',
                'approved_budget' => 5000.00,
            ],
            [
                'name' => 'Senior Citizen Art Therapy',
                'description' => 'Wellness and creative expression session tailored for senior citizen members.',
                'location' => 'Community Arts Center',
                'membership_ids' => [3],
                'event_start' => '2026-06-29 14:00:00',
                'event_end' => '2026-06-29 17:00:00',
                'call_time_start' => '2026-06-29 13:00:00',
                'call_time_end' => '2026-06-29 17:30:00',
                'notification_message' => 'Creative therapy for seniors.',
                'approved_budget' => 7000.00,
            ],
            [
                'name' => 'Housing Repair Orientation',
                'description' => 'Home improvement planning and support for Housing Support members.',
                'location' => 'Barangay Multipurpose Hall',
                'membership_ids' => [9],
                'event_start' => '2026-07-01 09:00:00',
                'event_end' => '2026-07-01 12:00:00',
                'call_time_start' => '2026-07-01 08:00:00',
                'call_time_end' => '2026-07-01 12:30:00',
                'notification_message' => 'Home repair assistance.',
                'approved_budget' => 4800.00,
            ],
            [
                'name' => 'Health Insurance Claims Clinic',
                'description' => 'One-on-one assistance for Health Insurance Program members filing PhilHealth claims.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-07-05 08:30:00',
                'event_end' => '2026-07-05 11:30:00',
                'call_time_start' => '2026-07-05 07:30:00',
                'call_time_end' => '2026-07-05 12:00:00',
                'notification_message' => 'File your claims here.',
                'approved_budget' => 2500.00,
            ],
            [
                'name' => 'Senior Citizen Legal Aid Clinic',
                'description' => 'Legal aid and rights counseling for members of the Senior Citizen Program.',
                'location' => 'Barangay Legal Aid Office',
                'membership_ids' => [3],
                'event_start' => '2026-07-08 09:00:00',
                'event_end' => '2026-07-08 12:00:00',
                'call_time_start' => '2026-07-08 08:00:00',
                'call_time_end' => '2026-07-08 12:30:00',
                'notification_message' => 'Free legal advice for seniors.',
                'approved_budget' => 6000.00,
            ],
            [
                'name' => 'Walang Gutom Food Budgeting Workshop',
                'description' => 'Practical budgeting tips and nutrition planning for Walang Gutom members.',
                'location' => 'Community Training Room',
                'membership_ids' => [2],
                'event_start' => '2026-07-10 10:00:00',
                'event_end' => '2026-07-10 13:00:00',
                'call_time_start' => '2026-07-10 09:00:00',
                'call_time_end' => '2026-07-10 13:30:00',
                'notification_message' => 'Budgeting tips for food.',
                'approved_budget' => 5000.00,
            ],
            [
                'name' => 'Housing Program Claim Assistance',
                'description' => 'Claim filing and documentation assistance for Housing Support members.',
                'location' => 'Barangay Hall Annex',
                'membership_ids' => [9],
                'event_start' => '2026-07-12 09:00:00',
                'event_end' => '2026-07-12 12:00:00',
                'call_time_start' => '2026-07-12 08:00:00',
                'call_time_end' => '2026-07-12 12:30:00',
                'notification_message' => 'Housing claim assistance.',
                'approved_budget' => 2800.00,
            ],
            [
                'name' => 'Pantawid Pamilya Parent Education Seminar',
                'description' => 'Parent education and support seminar exclusively for Pantawid Pamilya members.',
                'location' => 'Multi-Purpose Hall',
                'membership_ids' => [1],
                'event_start' => '2026-07-14 13:00:00',
                'event_end' => '2026-07-14 16:00:00',
                'call_time_start' => '2026-07-14 12:00:00',
                'call_time_end' => '2026-07-14 16:30:00',
                'notification_message' => 'Parenting education seminar.',
                'approved_budget' => 5200.00,
            ],
            [
                'name' => 'Livelihood Startup Pitch for Young Entrepreneurs',
                'description' => 'A pitch and mentoring event for Livelihood Assistance members.',
                'location' => 'Barangay Innovation Center',
                'membership_ids' => [7],
                'event_start' => '2026-07-16 09:00:00',
                'event_end' => '2026-07-16 12:00:00',
                'call_time_start' => '2026-07-16 08:00:00',
                'call_time_end' => '2026-07-16 12:30:00',
                'notification_message' => 'Pitch your business idea.',
                'approved_budget' => 8000.00,
            ],
            [
                'name' => 'Solo Parent Legal Rights Briefing',
                'description' => 'Legal rights briefing and support services for members of the Solo Parent Support program.',
                'location' => 'Barangay Hall Conference Room',
                'membership_ids' => [5],
                'event_start' => '2026-07-18 10:00:00',
                'event_end' => '2026-07-18 12:00:00',
                'call_time_start' => '2026-07-18 09:00:00',
                'call_time_end' => '2026-07-18 12:30:00',
                'notification_message' => 'Know your legal rights.',
                'approved_budget' => 5000.00,
            ],
            [
                'name' => 'PWD Mobility Support Clinic',
                'description' => 'Mobility assessment and support service for members of the PWD Assistance program.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [4],
                'event_start' => '2026-07-20 09:00:00',
                'event_end' => '2026-07-20 11:00:00',
                'call_time_start' => '2026-07-20 08:00:00',
                'call_time_end' => '2026-07-20 11:30:00',
                'notification_message' => 'Mobility support services.',
                'approved_budget' => 6000.00,
            ],
            [
                'name' => 'Educational Assistance Scholarship Preparation',
                'description' => 'Scholarship and grant preparation workshop for Educational Assistance members.',
                'location' => 'Community Learning Center',
                'membership_ids' => [8],
                'event_start' => '2026-07-22 13:00:00',
                'event_end' => '2026-07-22 15:00:00',
                'call_time_start' => '2026-07-22 12:00:00',
                'call_time_end' => '2026-07-22 15:30:00',
                'notification_message' => 'Prepare your scholarship application.',
                'approved_budget' => 4200.00,
            ],
            [
                'name' => 'Emergency Relief Volunteer Training',
                'description' => 'Volunteer training session for Emergency Relief Program members to prepare for disaster response.',
                'location' => 'Barangay Assembly Hall',
                'membership_ids' => [10],
                'event_start' => '2026-07-24 08:00:00',
                'event_end' => '2026-07-24 11:00:00',
                'call_time_start' => '2026-07-24 07:00:00',
                'call_time_end' => '2026-07-24 11:30:00',
                'notification_message' => 'Volunteer training for emergencies.',
                'approved_budget' => 7500.00,
            ],
            [
                'name' => 'Pantawid Pamilya Health Awareness Day',
                'description' => 'Health awareness and prevention seminar for Pantawid Pamilya members.',
                'location' => 'Barangay Gymnasium',
                'membership_ids' => [1],
                'event_start' => '2026-07-26 09:00:00',
                'event_end' => '2026-07-26 12:00:00',
                'call_time_start' => '2026-07-26 08:00:00',
                'call_time_end' => '2026-07-26 12:30:00',
                'notification_message' => 'Health awareness day.',
                'approved_budget' => 6500.00,
            ],
            [
                'name' => 'Health Insurance Family Wellness Check',
                'description' => 'Family wellness check-up session for Health Insurance Program members and their dependents.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-07-28 09:00:00',
                'event_end' => '2026-07-28 12:00:00',
                'call_time_start' => '2026-07-28 08:00:00',
                'call_time_end' => '2026-07-28 12:30:00',
                'notification_message' => 'Family wellness check-up.',
                'approved_budget' => 8500.00,
            ],

            // =========================================================
            // UPCOMING EVENTS -- dates are computed relative to now()
            // instead of hard-coded, so this batch always lands in the
            // future (and shows up in the QR Scanner's "not finished"
            // Select Event combobox) no matter what day the seeder is
            // actually run on, unlike the historical batch above.
            // =========================================================
            [
                'name' => 'Barangay Assembly Meeting',
                'description' => 'Monthly assembly for all residents to discuss barangay updates, concerns, and announcements.',
                'location' => 'Barangay Hall',
                'membership_ids' => [],
                'event_start' => now()->addDays(2)->setTime(18, 0, 0)->format('Y-m-d H:i:s'),
                'event_end' => now()->addDays(2)->setTime(20, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_start' => now()->addDays(2)->setTime(17, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_end' => now()->addDays(2)->setTime(20, 30, 0)->format('Y-m-d H:i:s'),
                'notification_message' => 'Monthly barangay assembly meeting.',
                'approved_budget' => 4500.00,
            ],
            [
                'name' => 'Senior Citizen Monthly Pension Release',
                'description' => 'Monthly pension distribution and check-in for Senior Citizen Program members.',
                'location' => 'Barangay Hall',
                'membership_ids' => [3],
                'event_start' => now()->addDays(7)->setTime(8, 0, 0)->format('Y-m-d H:i:s'),
                'event_end' => now()->addDays(7)->setTime(11, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_start' => now()->addDays(7)->setTime(7, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_end' => now()->addDays(7)->setTime(11, 30, 0)->format('Y-m-d H:i:s'),
                'notification_message' => 'Monthly pension release for senior citizens.',
                'approved_budget' => 3000.00,
            ],
            [
                'name' => 'Solo Parent Wellness Circle',
                'description' => 'Support group and wellness session for Solo Parent Support Program members.',
                'location' => 'Barangay Multipurpose Hall',
                'membership_ids' => [5],
                'event_start' => now()->addDays(12)->setTime(13, 0, 0)->format('Y-m-d H:i:s'),
                'event_end' => now()->addDays(12)->setTime(15, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_start' => now()->addDays(12)->setTime(12, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_end' => now()->addDays(12)->setTime(15, 30, 0)->format('Y-m-d H:i:s'),
                'notification_message' => 'Solo parent wellness support circle.',
                'approved_budget' => 4000.00,
            ],
            [
                'name' => 'Community Feeding Program',
                'description' => 'Community feeding activity providing meals for food-poor families under Walang Gutom.',
                'location' => 'Barangay Covered Court',
                'membership_ids' => [],
                'event_start' => now()->addDays(18)->setTime(9, 0, 0)->format('Y-m-d H:i:s'),
                'event_end' => now()->addDays(18)->setTime(12, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_start' => now()->addDays(18)->setTime(8, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_end' => now()->addDays(18)->setTime(12, 30, 0)->format('Y-m-d H:i:s'),
                'notification_message' => 'Community feeding program for food-poor families.',
                'approved_budget' => 26000.00,
            ],
            [
                'name' => 'PWD Assistive Devices Distribution',
                'description' => 'Distribution of wheelchairs, canes, and other assistive devices for PWD Assistance members.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [4],
                'event_start' => now()->addDays(25)->setTime(9, 0, 0)->format('Y-m-d H:i:s'),
                'event_end' => now()->addDays(25)->setTime(11, 30, 0)->format('Y-m-d H:i:s'),
                'call_time_start' => now()->addDays(25)->setTime(8, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_end' => now()->addDays(25)->setTime(12, 0, 0)->format('Y-m-d H:i:s'),
                'notification_message' => 'Assistive devices distribution for PWD members.',
                'approved_budget' => 15000.00,
            ],
            [
                'name' => 'Livelihood Skills Fair',
                'description' => 'Full-day skills training and job fair for Livelihood Assistance Program members.',
                'location' => 'Barangay Covered Court',
                'membership_ids' => [7],
                'event_start' => now()->addDays(32)->setTime(9, 0, 0)->format('Y-m-d H:i:s'),
                'event_end' => now()->addDays(32)->setTime(16, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_start' => now()->addDays(32)->setTime(8, 0, 0)->format('Y-m-d H:i:s'),
                'call_time_end' => now()->addDays(32)->setTime(16, 30, 0)->format('Y-m-d H:i:s'),
                'notification_message' => 'Livelihood skills training and job fair.',
                'approved_budget' => 12000.00,
            ],
        ];

        // Past, ongoing, incoming and upcoming events filling out the calendar
        // from August through December 31, 2026.
        $events = array_merge($events, $this->additionalEvents());

        foreach ($events as $eventData) {
            // Create the event
            $event = Event::create($eventData);
            $this->command->info("✅ Created event: {$event->name}");
            
            // Create notifications for eligible users (including staff)
            if ($users->isNotEmpty()) {
                $createdCount = $this->createNotificationsForEvent($event, $users);
                $this->command->line("   📨 Created {$createdCount} notifications for eligible users");
            }
        }
        
        $this->command->info("\n🎉 Event seeding completed successfully!");
    }
    
    /**
     * Extra events so the calendar is populated from August all the way to
     * December 31, 2026:
     *  - PAST (hard-coded Aug 2 -> Oct 5): finished events, each with
     *    attendance, expenses, and borrowed/returned equipment seeded by the
     *    other seeders.
     *  - ONGOING / INCOMING (relative to now()): one event that is in progress
     *    right now and one that starts tomorrow, so the dashboard and the QR
     *    scanner always have something live regardless of the run date.
     *  - UPCOMING (hard-coded Oct 10 -> Dec 31): scheduled events through the
     *    end of the year, a few with equipment already reserved.
     * Names are unique, because the Budget / Inventory seeders find events by name.
     */
    private function additionalEvents(): array
    {
        $make = function (string $name, string $description, string $location, array $membershipIds, Carbon $start, Carbon $end, string $message, float $budget): array {
            return [
                'name' => $name,
                'description' => $description,
                'location' => $location,
                'membership_ids' => $membershipIds,
                'event_start' => $start->format('Y-m-d H:i:s'),
                'event_end' => $end->format('Y-m-d H:i:s'),
                'call_time_start' => $start->copy()->subHour()->format('Y-m-d H:i:s'),
                'call_time_end' => $end->copy()->addMinutes(30)->format('Y-m-d H:i:s'),
                'notification_message' => $message,
                'approved_budget' => $budget,
            ];
        };

        return [
            // ---------- PAST ----------
            $make('Buwan ng Wika Cultural Program', 'Community celebration of Filipino language and culture with performances from residents and school groups.', 'Barangay Covered Court', [], Carbon::parse('2026-08-02 15:00:00'), Carbon::parse('2026-08-02 18:00:00'), 'Wear your traditional attire and join the program.', 9000.00),
            $make('Senior Citizen Blood Sugar Screening', 'Free blood sugar and blood pressure screening for senior citizen members.', 'Barangay Health Center', [3], Carbon::parse('2026-08-05 08:00:00'), Carbon::parse('2026-08-05 11:00:00'), 'Fasting is recommended before the screening.', 5500.00),
            $make('Pantawid Pamilya Financial Literacy Seminar', 'Budgeting and savings seminar for Pantawid Pamilya households.', 'Community Training Room', [1], Carbon::parse('2026-08-09 09:00:00'), Carbon::parse('2026-08-09 12:00:00'), 'Learn how to stretch and save your household budget.', 6000.00),
            $make('PWD Livelihood Skills Training', 'Hands-on skills training to help PWD Assistance members start small income projects.', 'Community Training Room', [4], Carbon::parse('2026-08-12 09:00:00'), Carbon::parse('2026-08-12 15:00:00'), 'Bring a valid PWD ID.', 8000.00),
            $make('Solo Parent Livelihood Bazaar', 'A bazaar where Solo Parent Support members can sell homemade products.', 'Barangay Covered Court', [5], Carbon::parse('2026-08-15 09:00:00'), Carbon::parse('2026-08-15 16:00:00'), 'Bring your products and a table cloth if you have one.', 7000.00),
            $make('Walang Gutom Urban Gardening Workshop', 'Backyard and container gardening workshop for Walang Gutom beneficiaries.', 'Barangay Gymnasium', [2], Carbon::parse('2026-08-19 09:00:00'), Carbon::parse('2026-08-19 12:00:00'), 'Free seedlings for every participant.', 5000.00),
            $make('Health Insurance Dental Mission', 'Free dental check-ups and tooth extraction for Health Insurance Program members.', 'Barangay Health Center', [6], Carbon::parse('2026-08-22 08:00:00'), Carbon::parse('2026-08-22 16:00:00'), 'Bring your PhilHealth ID.', 12000.00),
            $make('Housing Program Community Planning', 'Planning session with Housing Support Program members on repair and relocation priorities.', 'Barangay Hall', [9], Carbon::parse('2026-08-26 14:00:00'), Carbon::parse('2026-08-26 17:00:00'), 'Share your housing concerns with the team.', 3500.00),
            $make('Educational Assistance Tutorial Kickoff', 'Kickoff of the free after-school tutorial program for Educational Assistance members.', 'Community Training Room', [8], Carbon::parse('2026-08-30 13:00:00'), Carbon::parse('2026-08-30 16:00:00'), 'Students must bring a notebook and pen.', 4500.00),
            $make('Barangay Flood Preparedness Drill', 'Flood response drill covering evacuation routes, life vest use, and rescue basics.', 'Barangay Covered Court', [10], Carbon::parse('2026-09-02 07:00:00'), Carbon::parse('2026-09-02 11:00:00'), 'Wear comfortable clothes and closed shoes.', 8000.00),
            $make('Senior Citizen Zumba & Wellness Session', 'Light exercise and wellness session for senior citizen members.', 'Barangay Gymnasium', [3], Carbon::parse('2026-09-06 06:00:00'), Carbon::parse('2026-09-06 08:00:00'), 'Wear light clothes and bring a towel.', 3500.00),
            $make('Barangay Tree Planting Day', 'Community tree planting along the riverside to prevent erosion and flooding.', 'Barangay Riverside Park', [], Carbon::parse('2026-09-09 06:30:00'), Carbon::parse('2026-09-09 10:30:00'), 'Bring a hat and a water bottle.', 6500.00),
            $make('Livelihood Product Showcase', 'Showcase and sale of products made by Livelihood Assistance Program members.', 'Barangay Covered Court', [7], Carbon::parse('2026-09-13 09:00:00'), Carbon::parse('2026-09-13 16:00:00'), 'Display your products to the community.', 9000.00),
            $make('PWD Sign Language Basics Workshop', 'Introductory Filipino Sign Language workshop for PWD members, families, and volunteers.', 'Community Training Room', [4], Carbon::parse('2026-09-16 13:00:00'), Carbon::parse('2026-09-16 16:00:00'), 'Open to family members and volunteers.', 5000.00),
            $make('Pantawid Pamilya Nutrition & Cooking Demo', 'Cooking demonstration of low-cost, nutritious meals for Pantawid Pamilya households.', 'Barangay Covered Court', [1], Carbon::parse('2026-09-20 09:00:00'), Carbon::parse('2026-09-20 12:00:00'), 'Free taste test for all attendees.', 8000.00),
            $make('Emergency Relief Mock Evacuation', 'Barangay-wide mock evacuation to test response times and relief logistics.', 'Barangay Covered Court', [10], Carbon::parse('2026-09-23 06:00:00'), Carbon::parse('2026-09-23 10:00:00'), 'Participate with your household.', 7000.00),
            $make('Solo Parent Counseling Day', 'One-on-one and group counseling for Solo Parent Support members.', 'Barangay Multipurpose Hall', [5], Carbon::parse('2026-09-27 09:00:00'), Carbon::parse('2026-09-27 15:00:00'), 'Free counseling and childcare on site.', 6000.00),
            $make('Health Insurance Vaccination Drive', 'Community vaccination drive for Health Insurance Program members and their families.', 'Barangay Health Center', [6], Carbon::parse('2026-09-30 08:00:00'), Carbon::parse('2026-09-30 15:00:00'), 'Bring your vaccination card.', 14000.00),
            $make('Barangay Sports Fest Opening', 'Opening ceremony and first games of the barangay sports festival.', 'Barangay Gymnasium', [], Carbon::parse('2026-10-03 08:00:00'), Carbon::parse('2026-10-03 12:00:00'), 'Wear your team color.', 10000.00),
            $make('Educational Assistance School Supplies Distribution', 'Distribution of school supply kits to Educational Assistance Program members.', 'Barangay Hall', [8], Carbon::parse('2026-10-05 09:00:00'), Carbon::parse('2026-10-05 12:00:00'), 'Bring your school ID or enrollment form.', 12000.00),

            // ---------- ONGOING & INCOMING (relative to now) ----------
            $make('Barangay Health & Wellness Caravan', 'All-day caravan with free check-ups, consultations, and wellness booths -- happening right now.', 'Barangay Hall', [], now()->subHour(), now()->addHours(5), 'Free check-ups and consultations all day.', 9500.00),
            $make('Barangay Disaster Risk Reduction Orientation', 'Orientation on disaster risk reduction, hazard maps, and household preparedness -- starting soon.', 'Barangay Hall', [], now()->addDay()->setTime(9, 0, 0), now()->addDay()->setTime(12, 0, 0), 'Learn how to prepare your household for disasters.', 4500.00),

            // ---------- UPCOMING (through December 31, 2026) ----------
            $make('Pantawid Pamilya Family Day', 'A day of games, sharing, and family activities for Pantawid Pamilya households.', 'Barangay Covered Court', [1], Carbon::parse('2026-10-10 09:00:00'), Carbon::parse('2026-10-10 15:00:00'), 'Bring your family and a packed lunch.', 9500.00),
            $make('Senior Citizen Flu Vaccination', 'Free seasonal flu vaccination for senior citizen members.', 'Barangay Health Center', [3], Carbon::parse('2026-10-14 08:00:00'), Carbon::parse('2026-10-14 11:00:00'), 'Bring your senior citizen ID.', 8000.00),
            $make('Livelihood Soap-Making Training', 'Hands-on soap and detergent making training for Livelihood Assistance members.', 'Community Training Room', [7], Carbon::parse('2026-10-17 09:00:00'), Carbon::parse('2026-10-17 15:00:00'), 'All materials are provided.', 6500.00),
            $make('PWD Employment Orientation', 'Orientation on job opportunities, rights, and application tips for PWD members.', 'Barangay Hall', [4], Carbon::parse('2026-10-21 09:00:00'), Carbon::parse('2026-10-21 12:00:00'), 'Bring a copy of your resume if you have one.', 4500.00),
            $make('Walang Gutom Harvest Festival', 'Harvest festival and produce exchange for Walang Gutom urban gardeners.', 'Barangay Covered Court', [2], Carbon::parse('2026-10-24 08:00:00'), Carbon::parse('2026-10-24 14:00:00'), 'Bring your harvest to share or swap.', 9000.00),
            $make('Barangay Safe Trick-or-Treat Parade', 'A supervised, family-friendly costume parade for the barangay children.', 'Barangay Covered Court', [], Carbon::parse('2026-10-31 16:00:00'), Carbon::parse('2026-10-31 19:00:00'), 'Costumes must be safe and children must be accompanied.', 5000.00),
            $make('Housing Support Orientation Part 2', 'Follow-up orientation on housing repair claims and requirements.', 'Barangay Hall', [9], Carbon::parse('2026-11-03 09:00:00'), Carbon::parse('2026-11-03 12:00:00'), 'Bring your claim documents.', 4000.00),
            $make('Solo Parent Financial Planning Workshop', 'Budgeting, savings, and small business planning for Solo Parent Support members.', 'Barangay Multipurpose Hall', [5], Carbon::parse('2026-11-07 13:00:00'), Carbon::parse('2026-11-07 16:00:00'), 'Free childcare on site.', 6000.00),
            $make('Educational Assistance Scholarship Interviews', 'Panel interviews for scholarship applicants under the Educational Assistance Program.', 'Barangay Hall', [8], Carbon::parse('2026-11-11 09:00:00'), Carbon::parse('2026-11-11 16:00:00'), 'Dress neatly and bring your application documents.', 5000.00),
            $make('Health Insurance Diabetes Awareness Day', 'Screening and awareness talks on diabetes for Health Insurance Program members.', 'Barangay Health Center', [6], Carbon::parse('2026-11-14 08:00:00'), Carbon::parse('2026-11-14 12:00:00'), 'Fasting is recommended before the screening.', 9000.00),
            $make('Emergency Relief Earthquake Drill', 'Barangay earthquake drill with duck-cover-hold practice and evacuation.', 'Barangay Covered Court', [10], Carbon::parse('2026-11-18 09:00:00'), Carbon::parse('2026-11-18 12:00:00'), 'Participate with your household.', 7500.00),
            $make('Barangay Clean-Up & Recycling Drive', 'Community clean-up with a waste segregation and recycling station.', 'Barangay Hall', [], Carbon::parse('2026-11-21 07:00:00'), Carbon::parse('2026-11-21 11:00:00'), 'Bring gloves and a reusable bag.', 5500.00),
            $make('Senior Citizen Grandparents Day Lunch', 'A shared lunch and program honoring the barangay senior citizens.', 'Barangay Hall', [3], Carbon::parse('2026-11-25 11:00:00'), Carbon::parse('2026-11-25 14:00:00'), 'Lunch is free for all senior citizen members.', 8500.00),
            $make('Pantawid Pamilya Savings Group Launch', 'Launch of community savings groups for Pantawid Pamilya households.', 'Community Training Room', [1], Carbon::parse('2026-11-28 09:00:00'), Carbon::parse('2026-11-28 12:00:00'), 'Bring a valid ID.', 4000.00),
            $make('Barangay Christmas Lantern Making', 'Community lantern making for the barangay Christmas lantern parade.', 'Barangay Gymnasium', [], Carbon::parse('2026-12-02 14:00:00'), Carbon::parse('2026-12-02 17:00:00'), 'Materials provided. Families welcome.', 6000.00),
            $make('Livelihood Holiday Bazaar', 'Holiday bazaar for Livelihood Assistance members to sell Christmas products.', 'Barangay Covered Court', [7], Carbon::parse('2026-12-05 09:00:00'), Carbon::parse('2026-12-05 18:00:00'), 'Reserve your booth with the barangay staff.', 10000.00),
            $make('PWD Christmas Party', 'Christmas party and gift-giving for PWD Assistance members.', 'Barangay Hall', [4], Carbon::parse('2026-12-08 14:00:00'), Carbon::parse('2026-12-08 18:00:00'), 'Gifts and snacks for every member.', 12000.00),
            $make('Human Rights Day Community Forum', 'Community forum on human rights, child protection, and violence against women.', 'Barangay Hall', [], Carbon::parse('2026-12-10 09:00:00'), Carbon::parse('2026-12-10 12:00:00'), 'Open to all residents.', 4500.00),
            $make('Solo Parent Christmas Gift Giving', 'Gift-giving and fellowship for Solo Parent Support members and their children.', 'Barangay Multipurpose Hall', [5], Carbon::parse('2026-12-12 13:00:00'), Carbon::parse('2026-12-12 17:00:00'), 'Bring your children for the Christmas program.', 9000.00),
            $make('Senior Citizen Christmas Celebration', 'Christmas program, lunch, and raffle for senior citizen members.', 'Barangay Hall', [3], Carbon::parse('2026-12-15 10:00:00'), Carbon::parse('2026-12-15 15:00:00'), 'Free lunch and raffle for all members.', 20000.00),
            $make('Walang Gutom Noche Buena Pack Distribution', 'Distribution of Noche Buena packs to Walang Gutom households.', 'Barangay Covered Court', [2], Carbon::parse('2026-12-17 08:00:00'), Carbon::parse('2026-12-17 12:00:00'), 'Bring your beneficiary ID.', 30000.00),
            $make('Educational Assistance Year-End Awards', 'Recognition of outstanding scholars under the Educational Assistance Program.', 'Barangay Hall', [8], Carbon::parse('2026-12-19 14:00:00'), Carbon::parse('2026-12-19 17:00:00'), 'Scholars should wear formal attire.', 7500.00),
            $make('Housing Support Year-End Assessment', 'Year-end assessment of housing repair and relocation applications.', 'Barangay Hall', [9], Carbon::parse('2026-12-22 09:00:00'), Carbon::parse('2026-12-22 12:00:00'), 'Bring your acknowledgment receipt.', 3500.00),
            $make('Health Insurance Year-End Health Check', 'Year-end health check and PhilHealth claims assistance for members.', 'Barangay Health Center', [6], Carbon::parse('2026-12-26 08:00:00'), Carbon::parse('2026-12-26 12:00:00'), 'Bring your PhilHealth ID.', 8000.00),
            $make('Emergency Relief Preparedness Review', 'Year-end review of emergency plans, supplies, and volunteer assignments.', 'Barangay Hall', [10], Carbon::parse('2026-12-29 09:00:00'), Carbon::parse('2026-12-29 12:00:00'), 'Volunteers are encouraged to attend.', 5000.00),
            $make('Barangay Year-End Assembly & Thanksgiving', 'Year-end assembly with barangay accomplishments, awards, and thanksgiving.', 'Barangay Covered Court', [], Carbon::parse('2026-12-31 18:00:00'), Carbon::parse('2026-12-31 21:00:00'), 'Join the barangay in welcoming the new year.', 15000.00),
        ];
    }

    /**
     * Create notifications for all eligible users for a given event
     */
    private function createNotificationsForEvent($event, $users)
    {
        $membershipIds = $event->membership_ids ?? [];
        $createdCount = 0;
        
        foreach ($users as $user) {
            // Check if user is eligible for this event
            $isEligible = $this->isUserEligible($user, $membershipIds);
            
            if ($isEligible) {
                // Check if notification already exists to avoid duplicates
                $exists = Notification::where('user_id', $user->id)
                    ->where('event_id', $event->id)
                    ->exists();
                
                if (!$exists) {
                    Notification::create([
                        'user_id' => $user->id,
                        'event_id' => $event->id,
                        'type' => 'event_announcement',
                        'title' => 'New Event: ' . $event->name,
                        'message' => 'Staff: Santos • ' . $event->name . ' — ' . ($event->notification_message ?? 'New event announced'),
                        'is_updated' => false,
                        'updated_at_notification' => null,
                        'read' => false,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $createdCount++;
                }
            }
        }
        
        return $createdCount;
    }
    
    /**
     * Check if a user is eligible to receive notifications for an event
     */
    private function isUserEligible($user, $eventMembershipIds)
    {
        // If event is open to all (empty membership_ids), everyone is eligible
        if (empty($eventMembershipIds)) {
            return true;
        }
        
        // Get user's membership IDs from the loaded relationship
        $userMembershipIds = $user->memberships->pluck('id')->toArray();
        
        // Check if user has at least one required membership
        return !empty(array_intersect($eventMembershipIds, $userMembershipIds));
    }
}
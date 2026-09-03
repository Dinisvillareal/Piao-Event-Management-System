<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Event;
use App\Models\User;
use App\Models\Notification;

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
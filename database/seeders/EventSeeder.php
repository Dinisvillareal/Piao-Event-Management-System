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
                'notification_message' => 'Bring your own gloves and face mask.',
            ],
            [
                'name' => 'Senior Citizen Wellness Check',
                'description' => 'Health screening and support services for senior citizen members.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [3],
                'event_start' => '2026-06-05 08:00:00',
                'event_end' => '2026-06-05 11:00:00',
                'notification_message' => 'Free health checkup for senior citizens.',
            ],
            [
                'name' => 'Pantawid Pamilya Livelihood Workshop',
                'description' => 'Skills training and business planning for Pantawid Pamilya recipients.',
                'location' => 'Community Training Room',
                'membership_ids' => [1],
                'event_start' => '2026-06-08 09:00:00',
                'event_end' => '2026-06-08 15:00:00',
                'notification_message' => 'Learn new skills for your livelihood.',
            ],
            [
                'name' => 'Barangay Assembly Meeting',
                'description' => 'Barangay assembly for community announcements and resident questions.',
                'location' => 'Barangay Hall',
                'membership_ids' => [3],
                'event_start' => '2026-06-10 18:00:00',
                'event_end' => '2026-06-10 20:00:00',
                'notification_message' => 'Your presence is important.',
            ],
            [
                'name' => 'Walang Gutom Nutrition Seminar',
                'description' => 'Nutrition planning seminar for Walang Gutom beneficiaries.',
                'location' => 'Barangay Gymnasium',
                'membership_ids' => [2],
                'event_start' => '2026-06-12 10:00:00',
                'event_end' => '2026-06-12 13:00:00',
                'notification_message' => 'Learn about proper nutrition.',
            ],
            [
                'name' => 'Community Feeding Program',
                'description' => 'Feeding program offering free meals to residents.',
                'location' => 'Barangay Hall',
                'membership_ids' => [1],
                'event_start' => '2026-06-14 09:00:00',
                'event_end' => '2026-06-14 12:00:00',
                'notification_message' => 'Free meals for beneficiaries.',
            ],
            [
                'name' => 'PWD Accessibility Forum',
                'description' => 'Accessibility and benefits discussion for PWD members.',
                'location' => 'Barangay Hall',
                'membership_ids' => [4],
                'event_start' => '2026-06-16 09:00:00',
                'event_end' => '2026-06-16 12:00:00',
                'notification_message' => 'Discuss accessibility improvements.',
            ],
            [
                'name' => 'Solo Parent Support Session',
                'description' => 'Support session and resource briefing for solo parent members.',
                'location' => 'Multi-Purpose Hall',
                'membership_ids' => [5],
                'event_start' => '2026-06-18 13:00:00',
                'event_end' => '2026-06-18 16:00:00',
                'notification_message' => 'Support for solo parents.',
            ],
            [
                'name' => 'PhilHealth Enrollment Assistance',
                'description' => 'Enrollment assistance for members of the Health Insurance Program.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-06-20 09:00:00',
                'event_end' => '2026-06-20 12:00:00',
                'notification_message' => 'Get help with PhilHealth.',
            ],
            [
                'name' => 'Educational Grants Orientation',
                'description' => 'Scholarship and grant application support for Educational Assistance members.',
                'location' => 'Community Learning Center',
                'membership_ids' => [8],
                'event_start' => '2026-06-22 09:00:00',
                'event_end' => '2026-06-22 12:00:00',
                'notification_message' => 'Scholarship opportunities available.',
            ],
            [
                'name' => 'Emergency Relief Planning',
                'description' => 'Disaster relief coordination for Emergency Relief Program members.',
                'location' => 'Barangay Assembly Hall',
                'membership_ids' => [10],
                'event_start' => '2026-06-25 10:00:00',
                'event_end' => '2026-06-25 13:00:00',
                'notification_message' => 'Emergency preparedness training.',
            ],
            [
                'name' => 'Livelihood Program Follow-Up',
                'description' => 'Follow-up workshop for current Livelihood Assistance members.',
                'location' => 'Training Room 2',
                'membership_ids' => [7],
                'event_start' => '2026-06-27 09:00:00',
                'event_end' => '2026-06-27 12:00:00',
                'notification_message' => 'Follow-up on your livelihood.',
            ],
            [
                'name' => 'Senior Citizen Art Therapy',
                'description' => 'Wellness and creative expression session tailored for senior citizen members.',
                'location' => 'Community Arts Center',
                'membership_ids' => [3],
                'event_start' => '2026-06-29 14:00:00',
                'event_end' => '2026-06-29 17:00:00',
                'notification_message' => 'Creative therapy for seniors.',
            ],
            [
                'name' => 'Housing Repair Orientation',
                'description' => 'Home improvement planning and support for Housing Support members.',
                'location' => 'Barangay Multipurpose Hall',
                'membership_ids' => [9],
                'event_start' => '2026-07-01 09:00:00',
                'event_end' => '2026-07-01 12:00:00',
                'notification_message' => 'Home repair assistance.',
            ],
            [
                'name' => 'Health Insurance Claims Clinic',
                'description' => 'One-on-one assistance for Health Insurance Program members filing PhilHealth claims.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-07-05 08:30:00',
                'event_end' => '2026-07-05 11:30:00',
                'notification_message' => 'File your claims here.',
            ],
            [
                'name' => 'Senior Citizen Legal Aid Clinic',
                'description' => 'Legal aid and rights counseling for members of the Senior Citizen Program.',
                'location' => 'Barangay Legal Aid Office',
                'membership_ids' => [3],
                'event_start' => '2026-07-08 09:00:00',
                'event_end' => '2026-07-08 12:00:00',
                'notification_message' => 'Free legal advice for seniors.',
            ],
            [
                'name' => 'Walang Gutom Food Budgeting Workshop',
                'description' => 'Practical budgeting tips and nutrition planning for Walang Gutom members.',
                'location' => 'Community Training Room',
                'membership_ids' => [2],
                'event_start' => '2026-07-10 10:00:00',
                'event_end' => '2026-07-10 13:00:00',
                'notification_message' => 'Budgeting tips for food.',
            ],
            [
                'name' => 'Housing Program Claim Assistance',
                'description' => 'Claim filing and documentation assistance for Housing Support members.',
                'location' => 'Barangay Hall Annex',
                'membership_ids' => [9],
                'event_start' => '2026-07-12 09:00:00',
                'event_end' => '2026-07-12 12:00:00',
                'notification_message' => 'Housing claim assistance.',
            ],
            [
                'name' => 'Pantawid Pamilya Parent Education Seminar',
                'description' => 'Parent education and support seminar exclusively for Pantawid Pamilya members.',
                'location' => 'Multi-Purpose Hall',
                'membership_ids' => [1],
                'event_start' => '2026-07-14 13:00:00',
                'event_end' => '2026-07-14 16:00:00',
                'notification_message' => 'Parenting education seminar.',
            ],
            [
                'name' => 'Livelihood Startup Pitch for Young Entrepreneurs',
                'description' => 'A pitch and mentoring event for Livelihood Assistance members.',
                'location' => 'Barangay Innovation Center',
                'membership_ids' => [7],
                'event_start' => '2026-07-16 09:00:00',
                'event_end' => '2026-07-16 12:00:00',
                'notification_message' => 'Pitch your business idea.',
            ],
            [
                'name' => 'Solo Parent Legal Rights Briefing',
                'description' => 'Legal rights briefing and support services for members of the Solo Parent Support program.',
                'location' => 'Barangay Hall Conference Room',
                'membership_ids' => [5],
                'event_start' => '2026-07-18 10:00:00',
                'event_end' => '2026-07-18 12:00:00',
                'notification_message' => 'Know your legal rights.',
            ],
            [
                'name' => 'PWD Mobility Support Clinic',
                'description' => 'Mobility assessment and support service for members of the PWD Assistance program.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [4],
                'event_start' => '2026-07-20 09:00:00',
                'event_end' => '2026-07-20 11:00:00',
                'notification_message' => 'Mobility support services.',
            ],
            [
                'name' => 'Educational Assistance Scholarship Preparation',
                'description' => 'Scholarship and grant preparation workshop for Educational Assistance members.',
                'location' => 'Community Learning Center',
                'membership_ids' => [8],
                'event_start' => '2026-07-22 13:00:00',
                'event_end' => '2026-07-22 15:00:00',
                'notification_message' => 'Prepare your scholarship application.',
            ],
            [
                'name' => 'Emergency Relief Volunteer Training',
                'description' => 'Volunteer training session for Emergency Relief Program members to prepare for disaster response.',
                'location' => 'Barangay Assembly Hall',
                'membership_ids' => [10],
                'event_start' => '2026-07-24 08:00:00',
                'event_end' => '2026-07-24 11:00:00',
                'notification_message' => 'Volunteer training for emergencies.',
            ],
            [
                'name' => 'Pantawid Pamilya Health Awareness Day',
                'description' => 'Health awareness and prevention seminar for Pantawid Pamilya members.',
                'location' => 'Barangay Gymnasium',
                'membership_ids' => [1],
                'event_start' => '2026-07-26 09:00:00',
                'event_end' => '2026-07-26 12:00:00',
                'notification_message' => 'Health awareness day.',
            ],
            [
                'name' => 'Health Insurance Family Wellness Check',
                'description' => 'Family wellness check-up session for Health Insurance Program members and their dependents.',
                'location' => 'Barangay Health Center',
                'membership_ids' => [6],
                'event_start' => '2026-07-28 09:00:00',
                'event_end' => '2026-07-28 12:00:00',
                'notification_message' => 'Family wellness check-up.',
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
                        'message' => 'Staff: System • ' . $event->name . ' — ' . ($event->notification_message ?? 'New event announced'),
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
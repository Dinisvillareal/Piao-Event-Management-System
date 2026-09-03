<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Models\EventExpense;
use App\Models\User;
use Illuminate\Database\Seeder;

class EventExpenseSeeder extends Seeder
{
    /**
     * Realistic Budget & Expenses line items for every PAST event
     * EventSeeder already created -- looked up by name (Event has no
     * predictable id right after seeding) so this stays interconnected
     * with real event rows instead of inventing standalone events. Each
     * event's line items are sized to land close to (and in a few cases
     * deliberately just over) the approved_budget EventSeeder now sets
     * for that same event, so the Budget report has a believable mix of
     * on-budget and over-budget events to interpret instead of either all
     * green or all red. Events that are still upcoming get no expenses
     * yet -- matching real life, where nothing has been spent on an event
     * that hasn't happened.
     */
    public function run(): void
    {
        $recordedBy = User::where('role', 'Staff')->first()->first_name ?? 'Staff';

        $expensesByEvent = [
            'Barangay Clean-Up Drive' => [
                ['item' => 'Trash Bags (Heavy Duty, 50pcs)', 'amount' => 850.00, 'notes' => 'For clean-up volunteers.'],
                ['item' => 'Bottled Water (Case of 24, x10)', 'amount' => 1200.00, 'notes' => null],
                ['item' => 'Gloves (Rubber, 100 pairs)', 'amount' => 1500.00, 'notes' => null],
            ],
            'Senior Citizen Wellness Check' => [
                ['item' => 'Medical Supplies (BP kits, test strips)', 'amount' => 3200.00, 'notes' => 'Restocking for health screening.'],
                ['item' => 'Snacks for Attendees', 'amount' => 2500.00, 'notes' => null],
            ],
            'Pantawid Pamilya Livelihood Workshop' => [
                ['item' => 'Printed Training Materials', 'amount' => 1800.00, 'notes' => '150 booklets.'],
                ['item' => 'Resource Speaker Honorarium', 'amount' => 5000.00, 'notes' => null],
                ['item' => 'Venue Setup (Tables & Chairs Rental)', 'amount' => 2200.00, 'notes' => null],
            ],
            'Barangay Assembly Meeting' => [
                ['item' => 'Sound System Rental', 'amount' => 3000.00, 'notes' => null],
                ['item' => 'Printed Agenda & Handouts', 'amount' => 950.00, 'notes' => null],
            ],
            'Walang Gutom Nutrition Seminar' => [
                ['item' => 'Venue Sound System Rental', 'amount' => 1200.00, 'notes' => null],
                ['item' => 'Nutrition Info Handouts', 'amount' => 700.00, 'notes' => null],
                ['item' => 'Snacks for Attendees', 'amount' => 1800.00, 'notes' => null],
            ],
            'Community Feeding Program' => [
                ['item' => 'Rice (50kg sacks, x8)', 'amount' => 14400.00, 'notes' => null],
                ['item' => 'Canned Goods & Viand Ingredients', 'amount' => 9800.00, 'notes' => null],
                ['item' => 'LPG Refill (11kg, x3)', 'amount' => 2850.00, 'notes' => 'For kitchen equipment.'],
            ],
            'PWD Accessibility Forum' => [
                ['item' => 'Sign Language Interpreter Fee', 'amount' => 3500.00, 'notes' => null],
                ['item' => 'Venue Ramps & Access Signage', 'amount' => 1600.00, 'notes' => null],
            ],
            'Solo Parent Support Session' => [
                ['item' => 'Support Kit Materials', 'amount' => 950.00, 'notes' => null],
                ['item' => 'Light Snacks', 'amount' => 1100.00, 'notes' => null],
                ['item' => 'Childcare Volunteer Fee', 'amount' => 1500.00, 'notes' => 'On-site childminding during the session.'],
            ],
            'PhilHealth Enrollment Assistance' => [
                ['item' => 'Printed Enrollment Forms', 'amount' => 600.00, 'notes' => null],
                ['item' => 'Photocopying & Documentation', 'amount' => 450.00, 'notes' => null],
                ['item' => 'Coordinator Transportation Allowance', 'amount' => 800.00, 'notes' => null],
            ],
            'Educational Grants Orientation' => [
                ['item' => 'Scholarship Application Kits', 'amount' => 1400.00, 'notes' => null],
                ['item' => 'Guest Speaker Honorarium', 'amount' => 3000.00, 'notes' => null],
                ['item' => 'Printed Orientation Materials', 'amount' => 900.00, 'notes' => null],
            ],
            'Emergency Relief Planning' => [
                ['item' => 'Disaster Preparedness Kits (sample, 20pcs)', 'amount' => 4000.00, 'notes' => null],
                ['item' => 'Tarpaulin & Signage', 'amount' => 950.00, 'notes' => null],
                ['item' => 'Coordination Meeting Snacks', 'amount' => 700.00, 'notes' => null],
            ],
            'Livelihood Program Follow-Up' => [
                ['item' => 'Follow-Up Training Materials', 'amount' => 1100.00, 'notes' => null],
                ['item' => 'Resource Speaker Fee', 'amount' => 2500.00, 'notes' => null],
                ['item' => 'Venue Rental', 'amount' => 1500.00, 'notes' => 'Ran slightly over the approved budget.'],
            ],
            'Senior Citizen Art Therapy' => [
                ['item' => 'Art Supplies (paint, canvas, brushes)', 'amount' => 2800.00, 'notes' => null],
                ['item' => 'Facilitator Honorarium', 'amount' => 2500.00, 'notes' => null],
                ['item' => 'Snacks for Seniors', 'amount' => 1200.00, 'notes' => null],
            ],
            'Housing Repair Orientation' => [
                ['item' => 'Printed Repair Guidelines', 'amount' => 500.00, 'notes' => null],
                ['item' => 'Sample Materials Display', 'amount' => 1800.00, 'notes' => null],
                ['item' => 'Resource Person Fee', 'amount' => 2000.00, 'notes' => null],
            ],
            'Health Insurance Claims Clinic' => [
                ['item' => 'Claims Filing Supplies', 'amount' => 600.00, 'notes' => null],
                ['item' => 'Photocopying Services', 'amount' => 400.00, 'notes' => null],
                ['item' => 'Staff Overtime Allowance', 'amount' => 1200.00, 'notes' => null],
            ],
            'Senior Citizen Legal Aid Clinic' => [
                ['item' => 'Legal Aid Consultant Fee', 'amount' => 4000.00, 'notes' => null],
                ['item' => 'Printed Legal Guides', 'amount' => 700.00, 'notes' => null],
                ['item' => 'Snacks for Attendees', 'amount' => 900.00, 'notes' => null],
            ],
            'Walang Gutom Food Budgeting Workshop' => [
                ['item' => 'Budgeting Workbook Printouts', 'amount' => 850.00, 'notes' => null],
                ['item' => 'Facilitator Fee', 'amount' => 2200.00, 'notes' => null],
                ['item' => 'Sample Grocery Items for Demo', 'amount' => 1500.00, 'notes' => null],
            ],
            'Housing Program Claim Assistance' => [
                ['item' => 'Documentation Materials', 'amount' => 500.00, 'notes' => null],
                ['item' => 'Photocopying & Notarial Fees', 'amount' => 1200.00, 'notes' => null],
                ['item' => 'Staff Transportation', 'amount' => 700.00, 'notes' => null],
            ],
            'Pantawid Pamilya Parent Education Seminar' => [
                ['item' => 'Parenting Modules Printouts', 'amount' => 950.00, 'notes' => null],
                ['item' => 'Guest Speaker Fee', 'amount' => 2500.00, 'notes' => null],
                ['item' => 'Snacks for Parents', 'amount' => 1400.00, 'notes' => null],
            ],
            'Livelihood Startup Pitch for Young Entrepreneurs' => [
                ['item' => 'Pitch Event Materials', 'amount' => 1200.00, 'notes' => null],
                ['item' => "Judges' Honorarium (x3)", 'amount' => 4500.00, 'notes' => null],
                ['item' => 'Venue Setup & Sound', 'amount' => 2000.00, 'notes' => null],
            ],
            'Solo Parent Legal Rights Briefing' => [
                ['item' => 'Legal Briefing Handouts', 'amount' => 600.00, 'notes' => null],
                ['item' => 'Legal Consultant Fee', 'amount' => 3500.00, 'notes' => null],
                ['item' => 'Snacks', 'amount' => 900.00, 'notes' => null],
            ],
            'PWD Mobility Support Clinic' => [
                ['item' => 'Mobility Aid Assessment Supplies', 'amount' => 2500.00, 'notes' => null],
                ['item' => 'Medical Consultant Fee', 'amount' => 3000.00, 'notes' => 'Ran slightly over the approved budget.'],
                ['item' => 'Snacks for Attendees', 'amount' => 900.00, 'notes' => null],
            ],
            'Educational Assistance Scholarship Preparation' => [
                ['item' => 'Scholarship Prep Kits', 'amount' => 1100.00, 'notes' => null],
                ['item' => 'Guidance Counselor Honorarium', 'amount' => 2000.00, 'notes' => null],
                ['item' => 'Printed Materials', 'amount' => 600.00, 'notes' => null],
            ],
            'Emergency Relief Volunteer Training' => [
                ['item' => 'Training Manuals', 'amount' => 800.00, 'notes' => null],
                ['item' => 'First Aid Supplies', 'amount' => 3500.00, 'notes' => null],
                ['item' => 'Trainer Honorarium', 'amount' => 2800.00, 'notes' => null],
            ],
            'Pantawid Pamilya Health Awareness Day' => [
                ['item' => 'Health Awareness Materials', 'amount' => 900.00, 'notes' => null],
                ['item' => 'Medical Team Honorarium', 'amount' => 3500.00, 'notes' => null],
                ['item' => 'Snacks for Attendees', 'amount' => 1600.00, 'notes' => null],
            ],
            'Health Insurance Family Wellness Check' => [
                ['item' => 'Wellness Check Supplies', 'amount' => 3000.00, 'notes' => null],
                ['item' => 'Medical Team Fee', 'amount' => 3500.00, 'notes' => null],
                ['item' => 'Snacks for Families', 'amount' => 1800.00, 'notes' => null],
            ],
        ];

        foreach ($expensesByEvent as $eventName => $expenses) {
            $event = Event::where('name', $eventName)->first();

            if (!$event) {
                continue;
            }

            foreach ($expenses as $expense) {
                EventExpense::firstOrCreate(
                    ['event_id' => $event->id, 'item' => $expense['item']],
                    [
                        'amount' => $expense['amount'],
                        'notes' => $expense['notes'],
                        'recorded_by' => $recordedBy,
                    ]
                );
            }
        }
    }
}

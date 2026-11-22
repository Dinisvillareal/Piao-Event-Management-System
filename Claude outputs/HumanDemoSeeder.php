<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\CivilStatus;
use App\Models\CurrentStatus;
use App\Models\Event;
use App\Models\Household;
use App\Models\EventExpense;
use App\Models\EventInventoryItem;
use App\Models\EventInventoryRelease;
use App\Models\InventoryItem;
use App\Models\Membership;
use App\Models\MembershipResident;
use App\Models\Notification;
use App\Models\AgeBracket;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * A small, easy-to-read demo of Barangay Piao on 21-22 November 2026.
 *
 *   5 memberships   (Pantawid Pamilya / 4Ps, Walang Gutom, Senior Citizen, PWD, Solo Parent)
 *   10 people       (the Barangay Captain, the Barangay Secretary who is also the Head Staff, 2 Barangay Staff,
 *                   and 6 residents with real-sounding names, ages and statuses)
 *   5 events        (2 on Nov 21, 3 on Nov 22: the usual barangay activities)
 *   5 inventory items, borrowed by the events and returned after the ones that are over
 *   a budget        (a few real-sounding expenses for each event that has started, most with a receipt picture)
 *   attachments     (sample receipts, resident ID photos, item photos and return photos, drawn by DemoImages)
 *   households      (8 households: a father and daughter, a mother and daughter, a solo parent, people living alone)
 *   feedback        (HumanFeedbackSeeder: Bisaya comments and absence reasons from the 2 residents who have an account)
 *   notifications   (one announcement per eligible person, in plain words)
 *   10 activity logs
 *   attendance      (HumanAttendanceSeeder, run at the end)
 *
 * Use it on an EMPTY database:
 *
 *     php artisan migrate:fresh
 *     php artisan db:seed --class=HumanDemoSeeder
 *
 * Do not run it through DatabaseSeeder: that one turns model events off, and this seeder
 * relies on them (stock counts, the activity-log chain).
 */
class HumanDemoSeeder extends Seeder
{
    public function run(): void
    {
        // The pictures (items, IDs, receipts) are drawn with PHP's GD. Without it there would be no
        // pictures at all, so stop here, before anything is written, and say how to fix it.
        if (!DemoImages::available()) {
            $this->command?->error('PHP GD is switched off, so the pictures (items, IDs, receipts) cannot be made.');
            $this->command?->line('  1. Open  C:\\xampp\\php\\php.ini  and change  ;extension=gd  to  extension=gd  (remove the ;).');
            $this->command?->line('  2. Stop and start Apache/PHP, open a NEW terminal, check with:  php -m   (gd must be in the list).');
            $this->command?->line('  3. Run again:  php artisan migrate:fresh  then  php artisan db:seed --class=HumanDemoSeeder');
            return;
        }

        if (Event::withTrashed()->where('name', 'Barangay Clean-Up Drive')->whereDate('event_start', '2026-11-21')->exists()) {
            $this->command?->warn('The Nov 21-22 demo is already in this database. Use an empty one (php artisan migrate:fresh).');
            return;
        }

        // Age brackets, civil statuses and current statuses are the system's own lists
        // (Child / Youth / Adult / Senior Citizen, Single / Married ..., Solo Parent / PWD / 4Ps Beneficiary ...).
        $this->call([AgeBracketSeeder::class, CivilStatusSeeder::class, CurrentStatusSeeder::class]);

        $memberships = $this->memberships();
        $people = $this->people($memberships);
        // the households (HumanHouseholdSeeder): who lives with whom
        $this->call(HumanHouseholdSeeder::class);
        $events = $this->events($memberships);
        $items = $this->inventory();
        $this->itemAndIdPhotos($items, $people['all']);
        $this->borrowAndReturn($events, $items, $people['staff']);
        $this->budget($events, $people['head']);
        $this->notifications($events, $people['head']);

        // attendance: every eligible person gets a row, and the ones who came have real sign-in / sign-out times
        $this->call(HumanAttendanceSeeder::class);

        // feedback from the members who came, and reasons from the members who did not
        $this->call(HumanFeedbackSeeder::class);

        $this->activityLogs($events, $items, $memberships, $people);
        $this->summary($people);
    }

    // ------------------------------------------------------------------ memberships

    private function memberships(): array
    {
        $senior = AgeBracket::where('label', 'Senior Citizen')->value('id');
        $solo = CurrentStatus::where('label', 'Solo Parent')->value('id');

        $m = [];
        $m['pantawid'] = Membership::create([
            'name' => 'Pantawid Pamilya (4Ps)',
            'description' => 'Monthly cash help for poor families, so the children can go to school and get their regular check-ups.',
        ]);
        $m['gutom'] = Membership::create([
            'name' => 'Walang Gutom',
            'description' => 'Monthly food help for families who often go hungry, so there is always rice and food on the table.',
        ]);
        $m['senior'] = Membership::create([
            'name' => 'Senior Citizen',
            'description' => 'For lolos and lolas aged 60 and above: social pension, discounts, and regular health check-ups.',
        ]);
        if ($senior) {
            $m['senior']->eligibleAgeBrackets()->sync([$senior]);
        }
        $m['pwd'] = Membership::create([
            'name' => 'PWD Assistance',
            'description' => 'Help for persons with disability: medical support, discounts, and livelihood chances.',
        ]);
        $m['solo'] = Membership::create([
            'name' => 'Solo Parent',
            'description' => 'Help for parents raising their children alone: benefits, school support, and livelihood training.',
            'eligible_current_status_id' => $solo,
        ]);

        return $m;
    }

    // ------------------------------------------------------------------ people

    private function people(array $m): array
    {
        $civil = CivilStatus::pluck('id', 'label');
        $current = CurrentStatus::pluck('id', 'label');

        // first, middle, last, gender, birth date, civil status, contact, purok, role, memberships, current statuses
        $rows = [
            // --- the barangay's own people: the Secretary (also the Head Staff) first, then the two staff ---
            ['Teresita', 'Ramos', 'Bautista', 'Female', '1979-03-14', 'Married', '09171230001', 1, 'Staff', [], []],   // Barangay Secretary + Head Staff
            ['Ramon', 'Santos', 'Dela Cruz', 'Male', '1984-08-22', 'Married', '09171230002', 2, 'Staff', [], []],      // Barangay Staff
            ['Liza', 'Garcia', 'Aguilar', 'Female', '1992-01-09', 'Single', '09171230003', 1, 'Staff', [], []],        // Barangay Staff (Pedro Aguilar's daughter)

            // --- the Barangay Captain: a resident record that holds the captain's post (no login: the captain
            //     reads the staff's paper reports, he does not use the system himself) ---
            ['Ernesto', 'Cabrera', 'Manalo', 'Male', '1968-05-09', 'Married', '09171230010', 1, 'Resident', [], [], 'captain'],

            // --- residents ---
            ['Rosario', 'Cruz', 'Villanueva', 'Female', '1988-05-17', 'Married', '09181230001', 3, 'Resident', ['pantawid', 'gutom'], ['4Ps Beneficiary', 'Indigent']],
            ['Marites', 'Lopez', 'Soriano', 'Female', '1985-02-26', 'Widowed', '09181230003', 5, 'Resident', ['pantawid', 'solo'], ['Solo Parent', '4Ps Beneficiary']],
            ['Nenita', 'Torres', 'Alcantara', 'Female', '1980-06-30', 'Married', '09181230005', 4, 'Resident', ['gutom'], ['Indigent']],
            ['Pedro', 'Dimagiba', 'Aguilar', 'Male', '1955-01-20', 'Married', '09181230006', 1, 'Resident', ['senior'], ['Retired']],
            ['Cresencia', 'Bernardo', 'Macaraeg', 'Female', '1949-09-08', 'Widowed', '09181230007', 4, 'Resident', ['senior', 'gutom'], ['Retired', 'Indigent']],
            ['Danilo', 'Peralta', 'Mercado', 'Male', '1975-04-05', 'Married', '09181230009', 6, 'Resident', ['pwd'], ['Person with Disability (PWD)']],
        ];

        $next = User::withTrashed()->count() + 1;
        $staff = [];
        $all = [];
        $head = null;

        foreach ($rows as $row) {
            [$first, $middle, $last, $gender, $birth, $civilLabel, $phone, $purok, $role, $memberKeys, $statuses] = $row;
            $position = $row[11] ?? null; // 'captain' for the Barangay Captain
            $user = User::create([
                'user_code' => 'PR-' . str_pad($next++, 4, '0', STR_PAD_LEFT),
                'first_name' => $first,
                'middle_name' => $middle,
                'last_name' => $last,
                'contact_number' => $phone,
                'role' => $role,
                'password' => Hash::make('Piao@2026'),
                'has_account' => $role === 'Staff' ? 1 : 0,
                'birth_date' => $birth,
                'civil_status_id' => $civil[$civilLabel] ?? null,
                'gender' => $gender,
                'address' => "Purok {$purok}, Barangay Piao",
                'barangay_position' => $position ?? ($head === null && $role === 'Staff' ? 'secretary' : null),
            ]);

            // Two residents use the Member Portal, in Bisaya (the only residents who can leave feedback)
            if ($role === 'Resident' && in_array($first, ['Rosario', 'Nenita'], true)) {
                $user->forceFill(['has_account' => 1, 'preferred_language' => 'ceb'])->save();
            }

            $all[] = $user;
            if ($role === 'Staff') {
                $staff[] = $user;
                if ($head === null) {
                    // the Barangay Secretary is the Head Staff
                    $head = $user;
                    $user->forceFill(['is_head_staff' => true])->save();
                }
            }

            foreach ($memberKeys as $key) {
                MembershipResident::create(['user_id' => $user->id, 'membership_id' => $m[$key]->id]);
            }

            $ids = collect($statuses)->map(fn ($label) => $current[$label] ?? null)->filter()->values();
            if ($ids->isNotEmpty()) {
                $user->currentStatuses()->attach($ids);
            }
        }

        return ['staff' => $staff, 'head' => $head, 'all' => $all];
    }

    // ------------------------------------------------------------------ events

    private function events(array $m): array
    {
        $make = function (string $name, string $description, string $place, array $membershipIds, string $start, string $end, string $message, float $budget) {
            $s = Carbon::parse($start);
            $e = Carbon::parse($end);

            return Event::create([
                'name' => $name,
                'description' => $description,
                'location' => $place,
                'membership_ids' => $membershipIds,
                'event_start' => $s,
                'event_end' => $e,
                'call_time_start' => $s->copy()->subHour(),   // sign-in opens one hour before
                'call_time_end' => $e->copy()->addMinutes(30), // sign-out closes half an hour after
                'notification_message' => $message,
                'approved_budget' => $budget,
            ]);
        };

        return [
            'cleanup' => $make(
                'Barangay Clean-Up Drive',
                'Everyone helps sweep, collect trash, and clear the canals around the barangay hall and the main road.',
                'Barangay Hall', [], '2026-11-21 06:00:00', '2026-11-21 09:00:00',
                'Please bring gloves and a sako for the trash. See you, mga kapitbahay!', 3000.00),
            'assembly' => $make(
                'Barangay Assembly',
                'Quarterly assembly: the captain reports on projects and funds, and residents may ask questions.',
                'Barangay Covered Court', [], '2026-11-21 14:00:00', '2026-11-21 16:00:00',
                'Your presence is important. Please come on time.', 2500.00),
            'feeding' => $make(
                'Feeding Program for Kids',
                'Free hot lunch and vitamins for the children of Walang Gutom families.',
                'Barangay Hall', [$m['gutom']->id], '2026-11-22 08:00:00', '2026-11-22 11:00:00',
                'Please bring your child and your Walang Gutom ID.', 9000.00),
            'fourps' => $make(
                'Family Development Session',
                'Monthly 4Ps meeting on parenting, children\'s health, and family budgeting.',
                'Multi-Purpose Hall', [$m['pantawid']->id], '2026-11-22 13:00:00', '2026-11-22 16:00:00',
                'Please bring your 4Ps ID and a pen.', 4500.00),
            'seniors' => $make(
                'Senior Citizens\' Zumba and BP Check',
                'Light exercise for our lolos and lolas, followed by a free blood pressure check.',
                'Barangay Covered Court', [$m['senior']->id], '2026-11-22 17:00:00', '2026-11-22 19:00:00',
                'Wear light clothes and bring a towel. Free BP check for everyone.', 3500.00),
        ];
    }

    // ------------------------------------------------------------------ inventory

    private function inventory(): array
    {
        $rows = [
            'chairs' => ['Plastic Monobloc Chairs', ['good_quantity' => 90, 'fair_quantity' => 10], 'Barangay Hall Storage Room', 'For assemblies and seminars.'],
            'tables' => ['Folding Tables (6 ft)', ['good_quantity' => 12], 'Barangay Hall Storage Room', 'For registration and the feeding program.'],
            'sound' => ['Portable Sound System', ['good_quantity' => 2], 'Barangay Hall Equipment Room', 'With two wireless microphones.'],
            'tent' => ['Canopy Tent (10x10)', ['good_quantity' => 5, 'fair_quantity' => 1], 'Barangay Hall Storage Room', 'For outdoor activities.'],
            'bp' => ['Blood Pressure Monitor', ['good_quantity' => 3], 'Barangay Health Center', 'For the senior citizens\' health checks.'],
        ];

        $items = [];
        foreach ($rows as $key => [$name, $counts, $place, $notes]) {
            $items[$key] = InventoryItem::create([
                'name' => $name,
                'quantity' => array_sum($counts),
                'storage_location' => $place,
                'notes' => $notes,
                'lost_quantity' => 0,
            ] + $counts);
        }

        return $items;
    }

    /**
     * Each event borrows two or three items. When the event is over the items are back
     * (the loan is closed and the return is written); otherwise they are still out.
     */
    private function borrowAndReturn(array $e, array $i, array $staff): void
    {
        $plan = [
            ['cleanup', [['tent', 2], ['sound', 1]]],
            ['assembly', [['chairs', 60], ['tables', 4], ['sound', 1]]],
            ['feeding', [['tables', 6], ['chairs', 30], ['tent', 1]]],
            ['fourps', [['chairs', 25], ['tables', 3]]],
            ['seniors', [['chairs', 15], ['sound', 1], ['bp', 3]]],
        ];

        $n = 0;
        $photos = 0;
        foreach ($plan as [$eventKey, $list]) {
            $event = $e[$eventKey];
            $over = Carbon::parse($event->event_end)->lessThanOrEqualTo(now());

            foreach ($list as [$itemKey, $qty]) {
                $item = $i[$itemKey]->fresh();
                $units = $this->pickUnits($item, $qty);

                $loan = new EventInventoryItem(['event_id' => $event->id, 'inventory_item_id' => $item->id]);
                $loan->setUnits($units);
                $loan->save();

                if ($over) {
                    // given back a couple of hours after the event ended, in the same condition
                    $at = Carbon::parse($event->event_end)->addHours(2);
                    if ($at->greaterThan(now())) {
                        $at = now()->subMinutes(30);
                    }
                    // a photo taken when the items came back, for the first three returns of tents, sound and tables
                    $photo = null;
                    if (in_array($itemKey, ['tent', 'sound', 'tables'], true) && $photos < 3) {
                        $photo = DemoImages::itemPhoto(
                            $itemKey,
                            "{$item->name}, back at {$item->storage_location}",
                            "return_{$event->id}_{$itemKey}",
                            'release_evidence_photos',
                            'Returned after ' . $event->name
                        );
                        $photos += $photo ? 1 : 0;
                    }

                    $release = new EventInventoryRelease();
                    $release->setUnits($units);
                    $release->forceFill([
                        'event_id' => $event->id,
                        'inventory_item_id' => $item->id,
                        'released_by' => $staff[$n % count($staff)]->user_code,
                        'evidence_photo_path' => $photo,
                        'created_at' => $at,
                        'updated_at' => $at,
                    ])->save();
                    $loan->delete();
                } else {
                    $item->takeUnits($units);
                }
                $n++;
            }
        }
    }

    /** Hand out the Good units first, then New, Fair and Poor. */
    private function pickUnits(InventoryItem $item, int $qty): array
    {
        $have = $item->conditionCounts();
        $units = ['New' => 0, 'Good' => 0, 'Fair' => 0, 'Poor' => 0];
        foreach (['Good', 'New', 'Fair', 'Poor'] as $label) {
            $take = min($qty, $have[$label]);
            $units[$label] = $take;
            $qty -= $take;
        }

        return $units;
    }

    // ------------------------------------------------------------------ budget

    /** Expenses only for events that have already started: nothing is spent on an event that has not begun. */
    private function budget(array $e, User $head): void
    {
        // item, notes, shop, receipt lines [description, quantity, unit price]; the amount is the receipt total.
        // A line with no shop (an allowance paid in cash) has no receipt picture: not every expense has one.
        $hardware = 'Piao Hardware & Supply';
        $sariSari = 'Aling Nena\'s Sari-Sari Store';
        $bakery = 'Panaderia ni Mang Rudy';
        $copy = 'Piao Copy Center';
        $expenses = [
            'cleanup' => [
                ['Trash bags and gloves', 'Heavy-duty bags, 100 pairs of gloves.', $hardware, [['Heavy-duty trash bag (roll of 10)', 5, 90.00], ['Rubber gloves (pair)', 100, 8.00]]],
                ['Bottled water for the volunteers', null, $sariSari, [['Mineral water 500 ml', 60, 15.00]]],
                ['Merienda: pandesal and coffee', null, $bakery, [['Pandesal (piece)', 100, 4.00], ['3-in-1 coffee (sachet)', 50, 5.00]]],
            ],
            'assembly' => [
                ['Printed agenda and handouts', null, $copy, [['Print / photocopy (page)', 200, 3.00]]],
                ['Snacks for the attendees', null, $bakery, [['Ensaymada', 50, 12.00], ['Bottled juice', 50, 16.00]]],
                ['Tarpaulin banner', null, $copy, [['Tarpaulin 3 x 6 ft, printed', 1, 450.00]]],
            ],
            'feeding' => [
                ['Rice, 3 sacks (25 kg each)', null, 'Mang Berto Rice Dealer', [['Well-milled rice, 25 kg sack', 3, 1500.00]]],
                ['Chicken, vegetables, and other ingredients', 'Tinola for 80 children.', 'Piao Public Market', [['Whole chicken (kg)', 12, 140.00], ['Mixed vegetables (kg)', 10, 60.00], ['Ginger, garlic, onion, patis', 1, 520.00]]],
                ['LPG refill (11 kg)', null, 'Piao Gas Dealer', [['LPG refill, 11 kg', 1, 950.00]]],
                ['Vitamins for the children', null, 'Botika ni Aling Cora', [['Multivitamin syrup 120 ml', 12, 50.00]]],
            ],
            'fourps' => [
                ['Printed training modules', null, $copy, [['Printed module (set)', 40, 20.00]]],
                ['Speaker\'s allowance', 'Municipal social welfare officer. Paid in cash.', null, 1500.00],
                ['Snacks and drinks', null, $sariSari, [['Sandwich', 30, 25.00], ['Juice drink', 30, 15.00]]],
            ],
            'seniors' => [
                ['Zumba instructor\'s allowance', 'Paid in cash.', null, 1000.00],
                ['Bottled water and biscuits', null, $sariSari, [['Mineral water 500 ml', 25, 15.00], ['Biscuits (pack)', 25, 15.00]]],
            ],
        ];

        // Money records of an event that has ended are locked by the database. This history is
        // written first, so the lock is lifted for this seeder only and put back whatever happens.
        $lock = require database_path('migrations/2026_11_19_000013_lock_ended_event_budget_schedule_and_delete.php');
        $lock->down();

        try {
            foreach ($expenses as $key => $lines) {
                if (Carbon::parse($e[$key]->event_start)->greaterThan(now())) {
                    continue;
                }
                $n = 0;
                foreach ($lines as [$item, $notes, $shop, $detail]) {
                    $n++;
                    $day = Carbon::parse($e[$key]->event_start)->subDay()->format('M d, Y'); // bought the day before
                    // $detail is the receipt's lines, or (for cash allowances) the plain amount
                    $amount = is_array($detail) ? array_sum(array_map(fn ($l) => $l[1] * $l[2], $detail)) : $detail;
                    // a mix like real life: a photo of the paper receipt (jpg), an e-receipt (pdf), or a screenshot (png)
                    $format = ['jpg', 'pdf', 'png'][($n + $e[$key]->id) % 3];
                    $receipt = is_array($detail) ? DemoImages::receipt($shop, 'Poblacion, Piao', $day, sprintf('%05d', 1200 + $n * 37 + $e[$key]->id * 11), $detail, "receipt_{$key}_{$n}", $format) : null;

                    EventExpense::create([
                        'event_id' => $e[$key]->id,
                        'item' => $item,
                        'amount' => $amount,
                        'notes' => $notes,
                        'receipt_path' => $receipt,
                        'recorded_by' => $head->first_name,
                    ]);
                }
            }
        } finally {
            $lock->up();
        }
    }

    // ------------------------------------------------------------------ notifications

    /** One announcement for every person the event is meant for, posted a few days before it. */
    private function notifications(array $e, User $head): void
    {
        $postedDaysBefore = ['cleanup' => 4, 'assembly' => 4, 'feeding' => 3, 'fourps' => 3, 'seniors' => 2];
        $i = 0;

        foreach ($e as $key => $event) {
            $at = Carbon::parse($event->event_start)->subDays($postedDaysBefore[$key])->setTime(9, 0);
            $started = Carbon::parse($event->event_start)->lessThanOrEqualTo(now());

            foreach ($event->getEligibleResidents() as $user) {
                // by now people who could attend have mostly read it; an event that has not started is still new
                $read = $started ? ($i % 5 !== 0) : ($i % 3 === 0);
                (new Notification())->forceFill([
                    'user_id' => $user->id,
                    'event_id' => $event->id,
                    'type' => 'event_announcement',
                    'title' => 'New Event: ' . $event->name,
                    'message' => 'Staff: ' . $head->last_name . ' • ' . $event->name . ' — ' . $event->notification_message,
                    'is_updated' => false,
                    'updated_at_notification' => null,
                    'read' => $read,
                    'created_at' => $at,
                    'updated_at' => $at,
                ])->save();
                $i++;
            }
        }
    }

    // ------------------------------------------------------------------ attachments

    /** A photo for every inventory item and a valid-ID picture for every person (drawn samples, marked as such). */
    private function itemAndIdPhotos(array $items, array $people): void
    {
        foreach ($items as $key => $item) {
            $path = DemoImages::itemPhoto($key, "{$item->name} - {$item->storage_location}", "item_{$key}", 'inventory_photos');
            if ($path) {
                $item->forceFill(['photo_path' => $path])->save();
            }
        }

        foreach ($people as $user) {
            $name = trim($user->first_name . ' ' . $user->last_name);
            $role = $user->is_head_staff ? 'Barangay Secretary / Head Staff' : ($user->role === 'Staff' ? 'Barangay Staff' : ($user->barangay_position === 'captain' ? 'Barangay Captain' : 'Resident'));
            $path = DemoImages::idCard(
                $name,
                Carbon::parse($user->birth_date)->format('M d, Y'),
                $user->address,
                $user->user_code,
                $role,
                'id_' . strtolower($user->user_code),
                $user->role === 'Staff' ? 'png' : 'jpg'   // the residents' IDs are phone photos
            );
            if ($path) {
                $user->forceFill(['validation_id' => $path])->save();
            }
        }

        if (!DemoImages::available()) {
            $this->command?->warn('PHP GD is switched off, so no sample pictures were drawn. Enable extension=gd in php.ini to get them.');
        }
    }

    // ------------------------------------------------------------------ who is who

    /** Printed at the end so it is obvious who the Secretary, the staff and the residents are. */
    private function summary(array $people): void
    {
        $table = [];
        foreach ($people['all'] as $u) {
            $u->refresh(); // the household seeder changed this person after it was created
            $title = $u->is_head_staff ? 'Barangay Secretary (Head Staff)' : ($u->role === 'Staff' ? 'Barangay Staff' : ($u->barangay_position === 'captain' ? 'Barangay Captain' : 'Resident'));
            $table[] = [
                $u->user_code,
                trim("{$u->first_name} {$u->last_name}"),
                $title,
                $u->household_id ? Household::find($u->household_id)?->code : '-',
                $u->has_account ? 'Piao@2026' : '(no login)',
                $u->preferred_language === 'ceb' ? 'Bisaya' : 'English',
            ];
        }
        $this->command?->newLine();
        $this->command?->table(['Code', 'Name', 'Who', 'Household', 'Password', 'Language'], $table);
    }

    // ------------------------------------------------------------------ activity logs

    /** Exactly ten entries, oldest first, written through the model so each one joins the log's hash chain. */
    private function activityLogs(array $e, array $i, array $m, array $p): void
    {
        $head = $p['head']->user_code;
        $second = $p['staff'][1]->user_code;
        $third = $p['staff'][2]->user_code;
        $captain = collect($p['all'])->firstWhere('barangay_position', 'captain');
        $day = fn (string $d, string $t) => Carbon::parse("$d $t");

        $rows = [
            [$head, 'Create', 'Membership', "Added membership: {$m['pantawid']->name}", $day('2026-11-09', '09:10')],
            [$head, 'Create', 'Membership', "Added membership: {$m['gutom']->name}", $day('2026-11-09', '09:25')],
            [$second, 'Create User', 'User', "Created user {$captain->user_code} ({$captain->first_name} {$captain->last_name}, Barangay Captain)", $day('2026-11-10', '10:05')],
            [$third, 'Create', 'Inventory', "Added inventory item: {$i['chairs']->name}", $day('2026-11-12', '14:30')],
            [$head, 'Create', 'Events', "Created event: {$e['cleanup']->name}", $day('2026-11-17', '09:00')],
            [$head, 'Create', 'Events', "Created event: {$e['fourps']->name}", $day('2026-11-19', '09:00')],
        ];

        // two real scans and one real return, so the log matches the rest of the demo
        $scan = \App\Models\EventAttendance::whereNotNull('time_in')->whereNotNull('time_out')->with(['user', 'event'])->orderBy('id')->first();
        if ($scan) {
            $name = trim($scan->user->first_name . ' ' . $scan->user->last_name);
            $rows[] = [$second, 'Time In', 'QR', "{$name} signed in to {$scan->event->name}", Carbon::parse($scan->time_in)];
            $rows[] = [$second, 'Time Out', 'QR', "{$name} signed out of {$scan->event->name}", Carbon::parse($scan->time_out)];
        }
        $release = EventInventoryRelease::with(['event', 'inventoryItem'])->orderBy('id')->first();
        if ($release) {
            $rows[] = [$release->released_by ?? $third, 'Return Items', 'Inventory', "Returned {$release->quantity}x {$release->inventoryItem->name} from event: {$release->event->name}", Carbon::parse($release->created_at)];
        }
        $expense = EventExpense::with('event')->orderBy('id')->first();
        if ($expense) {
            $rows[] = [$head, 'Create', 'Budget', "Recorded expense '{$expense->item}' (PHP " . number_format((float) $expense->amount, 2) . ") for event: {$expense->event->name}", Carbon::parse($expense->event->event_end)->addHours(3)->min(now())];
        }

        // never more than ten; if something above was missing, fill up with a plain announcement log
        while (count($rows) < 10) {
            $rows[] = [$head, 'Create', 'Notifications', "Sent the announcement for event: {$e['seniors']->name}", $day('2026-11-20', '09:00')];
        }
        $rows = array_slice($rows, 0, 10);
        usort($rows, fn ($a, $b) => $a[4] <=> $b[4]);

        foreach ($rows as [$code, $action, $module, $description, $at]) {
            (new ActivityLog())->forceFill([
                'user_code' => $code,
                'action' => $action,
                'module' => $module,
                'description' => $description,
                'created_at' => $at,
                'updated_at' => $at,
            ])->save();
        }
    }
}

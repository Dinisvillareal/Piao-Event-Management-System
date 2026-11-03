<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\EventAttendance;
use App\Models\Event;
use App\Models\User;
use App\Models\ActivityLog;
use App\Support\Paged;

class EventAttendanceController extends Controller
{
  private function determineStatus($timeIn, $timeOut)
    {
        if ($timeIn && $timeOut) return 'Complete';
        return 'Incomplete';
    }

    // =========================
    // TIME IN - updates status from 'missed' to 'Incomplete'
    // =========================

    public function timeIn(Request $request)
    {
        // Only Staff scan residents in -- this endpoint takes user_id
        // straight from the request body (it's the resident being scanned,
        // not the caller), so without this check any authenticated
        // Resident could call it directly and mark themselves -- or anyone
        // else -- present without actually being at the event.
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'event_id' => 'required|exists:events,id',
            'user_id' => 'required|exists:users,id',
        ]);

        // ✅ Fetch the event AND the user to get their actual names
        $event = Event::findOrFail($request->event_id);
        $user = User::findOrFail($request->user_id);
        $userName = $user->first_name . ' ' . $user->last_name;

        // Only residents currently eligible under the event's membership
        // targeting may be scanned in. If staff retarget the event AFTER
        // someone already has a real time_in, this does NOT reach back and
        // touch their existing record (see the whereNull guard in
        // Event::syncAttendanceRecords()) -- it only blocks a brand new
        // sign-in attempt from someone outside the *current* eligible list.
        $eligibleIds = $event->getEligibleResidents()->pluck('id')->toArray();
        if (!in_array($user->id, $eligibleIds, true)) {
            return response()->json([
                'message' => "{$userName} is not eligible for this event under its current membership targeting.",
            ], 403);
        }

        // Sign-in window = [call_time_start, event_start]. Call time lets
        // staff invite residents earlier than the event's actual start
        // (e.g. call time 6:00, event starts 7:00) instead of sign-in being
        // open for the whole event duration. Events with no call time set
        // have no early bound at all (sign-in just stays open any time up
        // to event_start) -- NOT the same instant as event_start, which
        // would make the window zero-width.
        $currentTime = time();
        $windowOpen = $event->call_time_start ? strtotime($event->call_time_start) : null;
        $windowClose = strtotime($event->event_start);

        if ($windowOpen !== null && $currentTime < $windowOpen) {
            return response()->json([
                'message' => 'Sign-in is not open yet. It opens at ' . date('g:i A', $windowOpen) . '.',
            ], 403);
        }

        if ($currentTime > $windowClose) {
            return response()->json([
                'message' => 'Sign-in window has closed. It closed at ' . date('g:i A', $windowClose) . '.',
            ], 403);
        }

        DB::beginTransaction();

        try {
            $attendance = EventAttendance::where('event_id', $request->event_id)
                ->where('user_id', $request->user_id)
                ->first();

            if ($attendance) {
                if ($attendance->time_in) {
                    return response()->json(['message' => 'Member already signed in.'], 400);
                }

                $attendance->time_in = now();
                $attendance->status = 'Incomplete';
                $attendance->save();

                // ✅ Log with Name, Event Title, and 'QR' module
                $this->createLog(
                    'Time In',
                    'QR',
                    "{$userName} signed in to {$event->name}"
                );

                DB::commit();
                return response()->json(['message' => 'Time-in successful!', 'attendance' => $attendance]);
            }

            $attendance = EventAttendance::create([
                'event_id' => $request->event_id,
                'user_id' => $request->user_id,
                'time_in' => now(),
                'status' => 'Incomplete'
            ]);

            // ✅ Log with Name, Event Title, and 'QR' module
            $this->createLog(
                'Time In',
                'QR',
                "{$userName} signed in to {$event->name}"
            );

            DB::commit();
            return response()->json(['message' => 'Time-in successful!', 'attendance' => $attendance], 201);

        } catch (\Illuminate\Database\QueryException $e) {
            DB::rollBack();
            // SQLSTATE 23000 = integrity constraint violation, the same code
            // across MySQL/Postgres/SQLite -- means the (event_id, user_id)
            // unique index on `attendances` caught a concurrent duplicate
            // insert that slipped past the check above (a double-tap of the
            // Confirm button, two staff devices scanning the same resident
            // for the same event at once, or the offline queue replaying a
            // scan that actually landed on an earlier attempt before the
            // connection dropped). Report the same friendly message the
            // explicit already-signed-in check gives, instead of leaking the
            // raw SQL error to the UI as an unexplained failure.
            if ($e->getCode() === '23000') {
                return response()->json(['message' => 'Member already signed in.'], 400);
            }
            return response()->json(['message' => 'Time-in failed', 'error' => $e->getMessage()], 500);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Time-in failed', 'error' => $e->getMessage()], 500);
        }
    }

    // TIME OUT - sets status to 'Complete' when both times exist
    public function timeOut(Request $request)
    {
        // Same reasoning as timeIn() -- Staff only, see the comment there.
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'event_id' => 'required|exists:events,id',
            'user_id' => 'required|exists:users,id',
        ]);

        // ✅ Fetch the event AND the user to get their actual names
        $event = Event::findOrFail($request->event_id);
        $user = User::findOrFail($request->user_id);
        $userName = $user->first_name . ' ' . $user->last_name;

        // Eligibility check, same as timeIn(). Deliberate project decision:
        // once a resident is no longer on the event's current eligible
        // list, Event::syncAttendanceRecords() has already deleted their
        // attendance row entirely (see that method). Without this check, a
        // late time-out scan would silently create a brand-new orphan row
        // with only time_out set -- exactly the leftover "Incomplete"
        // record the project doesn't want. Blocking the scan here means no
        // row gets created at all, so nothing shows up on either the Staff
        // or Member side.
        $eligibleIds = $event->getEligibleResidents()->pluck('id')->toArray();
        if (!in_array($user->id, $eligibleIds, true)) {
            return response()->json([
                'message' => "{$userName} is not eligible for this event under its current membership targeting.",
            ], 403);
        }

        // Sign-out window = [event_end, call_time_end]. Events with no
        // event_end skip this check entirely (old behavior -- no
        // restriction). Events with event_end but no call_time_end get an
        // open-ended window starting at event_end (no upper bound).
        if ($event->event_end) {
            $currentTime = time();
            $windowOpen = strtotime($event->event_end);

            if ($currentTime < $windowOpen) {
                return response()->json([
                    'message' => 'Sign-out is not open yet. It opens at ' . date('g:i A', $windowOpen) . '.',
                ], 403);
            }

            if ($event->call_time_end) {
                $windowClose = strtotime($event->call_time_end);
                if ($currentTime > $windowClose) {
                    return response()->json([
                        'message' => 'Sign-out window has closed. It closed at ' . date('g:i A', $windowClose) . '.',
                    ], 403);
                }
            }
        }

        DB::beginTransaction();

        try {
            $attendance = EventAttendance::where('event_id', $request->event_id)
                ->where('user_id', $request->user_id)
                ->first();

            if (!$attendance) {
                $attendance = EventAttendance::create([
                    'event_id' => $request->event_id,
                    'user_id' => $request->user_id,
                    'time_out' => now(),
                    'status' => 'Incomplete'
                ]);

                // ✅ Log with Name, Event Title, and 'QR' module
                $this->createLog(
                    'Time Out',
                    'QR',
                    "{$userName} timed out without time-in on {$event->name}"
                );

                DB::commit();
                return response()->json(['message' => 'Time-out recorded without time-in.', 'attendance' => $attendance], 201);
            }

            if ($attendance->time_out) {
                return response()->json(['message' => 'Member already signed out.'], 400);
            }

            $attendance->time_out = now();
            $attendance->status = ($attendance->time_in && $attendance->time_out) ? 'Complete' : 'Incomplete';
            $attendance->save();

            // ✅ Log with Name, Event Title, and 'QR' module
            $this->createLog(
                'Time Out',
                'QR',
                "{$userName} signed out of {$event->name}"
            );

            DB::commit();
            return response()->json(['message' => 'Time-out successful!', 'attendance' => $attendance]);

        } catch (\Illuminate\Database\QueryException $e) {
            DB::rollBack();
            // Same reasoning as the matching catch in timeIn(): a concurrent
            // duplicate insert/update was caught by the (event_id, user_id)
            // unique index instead of the explicit "already signed out"
            // check above -- report the friendly message instead of a raw
            // SQL error.
            if ($e->getCode() === '23000') {
                return response()->json(['message' => 'Member already signed out.'], 400);
            }
            return response()->json(['message' => 'Time-out failed', 'error' => $e->getMessage()], 500);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Time-out failed', 'error' => $e->getMessage()], 500);
        }
    }
    // =========================
    // EVENT ATTENDEES
    // =========================

    public function getEventAttendees(Request $request, $eventId)
    {
        // Attendee lists carry other residents' personal details -- staff only.
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Events that haven't ended yet get any newly eligible people (e.g.
        // staff) added to their roster. Finished events keep their record.
        $event = Event::find($eventId);
        if ($event && (!$event->event_end || strtotime((string) $event->event_end) > time())) {
            $event->addMissingAttendanceRecords();
        }

        // paged=1 (the event's Attendance tab): the roster -- everyone eligible plus anyone who
        // scanned -- filtered by name / ID / status and cut into pages by the database.
        if ($request->boolean('paged') && $event) {
            return $this->pagedRoster($request, $event);
        }

        return response()->json(
            EventAttendance::with('user:id,first_name,last_name,user_code')
                ->where('event_id', $eventId)
                ->orderBy('time_in', 'desc')
                ->get()
        );
    }

   public function getMemberHistory(Request $request, $userId)
{
    // A resident may only read their own attendance history; staff can read anyone's.
    if ((int) auth()->id() !== (int) $userId && !$this->isStaff()) {
        return response()->json(['message' => 'Unauthorized'], 403);
    }

    // paged=1 (the member's Attendance screen): finished records only, filtered by
    // status / membership / date / search, "this week first" order, one page at a time.
    if ($request->boolean('paged')) {
        return $this->pagedMemberHistory($request, (int) $userId);
    }

    $attendances = EventAttendance::where('user_id', $userId)
        ->with('event')  // ✅ ADD THIS - LOADS THE EVENT RELATIONSHIP
        ->orderBy('time_in', 'desc')
        ->get()
        ->map(function ($attendance) {
            $isEventDeleted = is_null($attendance->event);
            
            return [
                'id' => $attendance->id,
                'eventId' => $attendance->event_id,
                'eventTitle' => $isEventDeleted ? '' : $attendance->event->name,
                'eventDate' => $isEventDeleted ? '' : $attendance->event->event_start,
                'eventEnd' => $isEventDeleted ? '' : $attendance->event->event_end,
                'location' => $isEventDeleted ? '' : $attendance->event->location,
                'timeIn' => $attendance->time_in,
                'timeOut' => $attendance->time_out,
                'status' => $attendance->status,
                'isEventDeleted' => $isEventDeleted,
            ];
        });
    
    return response()->json($attendances);
}

    /**
     * Mirrors the browser's attendanceStatus(): time in/out recorded -> complete or
     * incomplete; otherwise upcoming / ongoing / missed from the event's own window.
     */
    private function pagedMemberHistory(Request $request, int $userId)
    {
        $now = now()->toDateTimeString();
        $statusExpr = "CASE
            WHEN attendances.time_in IS NOT NULL OR attendances.time_out IS NOT NULL THEN (CASE WHEN LOWER(attendances.status) = 'complete' THEN 'complete' ELSE 'incomplete' END)
            WHEN events.event_start IS NULL THEN 'missed'
            WHEN ? < events.event_start THEN 'upcoming'
            WHEN ? <= COALESCE(events.event_end, events.event_start) THEN 'ongoing'
            ELSE 'missed' END";

        $base = EventAttendance::query()
            ->leftJoin('events', fn ($j) => $j->on('events.id', '=', 'attendances.event_id')->whereNull('events.deleted_at'))
            ->where('attendances.user_id', $userId)
            ->select('attendances.*');
        $allTotal = (clone $base)->count();

        $base->whereRaw("({$statusExpr}) IN ('complete', 'incomplete', 'missed')", [$now, $now]);

        if ($request->filled('membership')) {
            $id = (int) $request->input('membership');
            $base->where(fn ($q) => $q->whereJsonContains('events.membership_ids', $id)->orWhereJsonContains('events.membership_ids', (string) $id));
        }
        if ($request->filled('date')) {
            $base->whereRaw('DATE(events.event_start) = ?', [(string) $request->input('date')]);
        }
        foreach (Paged::tokens($request->input('search')) as $word) {
            $like = Paged::like($word);
            $base->where(function ($q) use ($like) {
                $q->whereRaw("LOWER(COALESCE(events.name, '')) LIKE ?", [$like])
                  ->orWhereRaw("LOWER(COALESCE(events.location, '')) LIKE ?", [$like])
                  ->orWhereRaw("CAST(events.event_start AS CHAR) LIKE ?", [$like])
                  ->orWhereRaw("CAST(attendances.time_in AS CHAR) LIKE ?", [$like])
                  ->orWhereRaw("CAST(attendances.time_out AS CHAR) LIKE ?", [$like]);
            });
        }

        // Size of each status choice under the other filters (so the dropdown counts add up).
        $counts = ['all' => (clone $base)->count()];
        foreach (['complete', 'incomplete', 'missed'] as $key) {
            $counts[$key] = (clone $base)->whereRaw("({$statusExpr}) = ?", [$now, $now, $key])->count();
        }

        $query = clone $base;
        $status = (string) $request->input('status', 'all');
        if (in_array($status, ['complete', 'incomplete', 'missed'], true)) {
            $query->whereRaw("({$statusExpr}) = ?", [$now, $now, $status]);
        }

        // "This week first" (Sunday-start week): what's still to come this week, then what
        // already finished, then later events soonest-first, then older ones latest-first.
        $weekStart = now()->copy()->startOfDay()->subDays(now()->dayOfWeek);
        $weekEnd = $weekStart->copy()->addDays(6)->endOfDay();
        $bucket = 'CASE WHEN events.event_start >= ? AND events.event_start <= ? THEN (CASE WHEN COALESCE(events.event_end, events.event_start) >= ? THEN 0 ELSE 1 END)
                        WHEN events.event_start > ? THEN 2 ELSE 3 END';
        $bindings = [$weekStart->toDateTimeString(), $weekEnd->toDateTimeString(), $now, $weekEnd->toDateTimeString()];
        $query->orderByRaw("({$bucket})", $bindings)
              ->orderByRaw("CASE WHEN ({$bucket}) IN (0, 2) THEN COALESCE(UNIX_TIMESTAMP(events.event_start), 0) ELSE -COALESCE(UNIX_TIMESTAMP(events.event_start), 0) END", $bindings)
              ->orderBy('attendances.id', 'desc');

        $paginator = $query->with('event')->paginate(Paged::perPage($request, 10), ['*'], 'page', Paged::page($request));
        $rows = $paginator->getCollection()->map(function ($attendance) {
            $isEventDeleted = is_null($attendance->event);

            return [
                'id' => $attendance->id,
                'eventId' => $attendance->event_id,
                'eventTitle' => $isEventDeleted ? '' : $attendance->event->name,
                'eventDate' => $isEventDeleted ? '' : $attendance->event->event_start,
                'eventEnd' => $isEventDeleted ? '' : $attendance->event->event_end,
                'location' => $isEventDeleted ? '' : $attendance->event->location,
                'timeIn' => $attendance->time_in,
                'timeOut' => $attendance->time_out,
                'status' => $attendance->status,
                'isEventDeleted' => $isEventDeleted,
            ];
        })->values();

        return response()->json(Paged::body($paginator, $rows, ['counts' => $counts, 'all_total' => $allTotal]));
    }

    /** Event roster page. status: all | complete | incomplete | upcoming | ongoing | missed (the last three = no scan yet). */
    private function pagedRoster(Request $request, Event $event)
    {
        $membershipIds = $event->membership_ids ?? [];
        $base = User::query()
            ->leftJoin('attendances', fn ($j) => $j->on('attendances.user_id', '=', 'users.id')->where('attendances.event_id', $event->id))
            ->where(function ($q) use ($membershipIds) {
                $q->whereNotNull('attendances.id')
                  ->orWhere(function ($e) use ($membershipIds) {
                      $e->whereIn('users.role', ['Resident', 'Staff']);
                      if (!empty($membershipIds)) {
                          $e->whereExists(fn ($m) => $m->select(DB::raw(1))->from('membership_residents')
                              ->whereColumn('membership_residents.user_id', 'users.id')
                              ->whereIn('membership_residents.membership_id', $membershipIds));
                      }
                  });
            })
            ->select('users.id', 'users.first_name', 'users.last_name', 'users.user_code', 'attendances.time_in', 'attendances.time_out');

        foreach (Paged::tokens($request->input('search')) as $word) {
            $like = Paged::like($word);
            $base->where(fn ($q) => $q->whereRaw("LOWER(CONCAT_WS(' ', users.first_name, users.last_name)) LIKE ?", [$like])
                ->orWhereRaw('LOWER(COALESCE(users.user_code, \'\')) LIKE ?', [$like]));
        }

        $complete = 'attendances.time_in IS NOT NULL AND attendances.time_out IS NOT NULL';
        $incomplete = '(attendances.time_in IS NOT NULL) <> (attendances.time_out IS NOT NULL)';
        $none = 'attendances.time_in IS NULL AND attendances.time_out IS NULL';
        $counts = [
            'all' => (clone $base)->count(),
            'complete' => (clone $base)->whereRaw($complete)->count(),
            'incomplete' => (clone $base)->whereRaw($incomplete)->count(),
            'none' => (clone $base)->whereRaw($none)->count(),
        ];

        $query = clone $base;
        $status = (string) $request->input('status', 'all');
        if ($status === 'complete') {
            $query->whereRaw($complete);
        } elseif ($status === 'incomplete') {
            $query->whereRaw($incomplete);
        } elseif (in_array($status, ['upcoming', 'ongoing', 'missed'], true)) {
            $query->whereRaw($none);
        }
        // Who actually attended first (complete, incomplete, then no scan), then last name A-Z.
        $query->orderByRaw("CASE WHEN {$complete} THEN 0 WHEN {$incomplete} THEN 1 ELSE 2 END")
              ->orderByRaw('LOWER(users.last_name)')->orderByRaw('LOWER(users.first_name)')->orderBy('users.id');

        $paginator = $query->paginate(Paged::perPage($request, 10), ['*'], 'page', Paged::page($request));
        $rows = $paginator->getCollection()->map(fn ($u) => [
            'residentId' => $u->id,
            'residentName' => trim("{$u->first_name} {$u->last_name}"),
            'userCode' => $u->user_code ?? '',
            'timeIn' => $u->time_in,
            'timeOut' => $u->time_out,
        ])->values();

        return response()->json(Paged::body($paginator, $rows, ['counts' => $counts]));
    }
}
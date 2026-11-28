<?php

namespace App\Http\Controllers;

use App\Models\Household;
use App\Models\User;
use App\Models\ActivityLog;
use App\Support\Paged;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HouseholdController extends Controller
{
    protected $logModule = 'Households';

    private function memberFields(): array
    {
        return ['id', 'user_code', 'first_name', 'last_name', 'middle_name', 'contact_number', 'is_household_head', 'household_id', 'role'];
    }

    /**
     * List households with their members eager-loaded, so the frontend can
     * show member counts / head / contact number without N+1 requests.
     */
    public function index(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = Household::with(['members' => function ($q) {
            $q->select($this->memberFields())->orderByDesc('is_household_head');
        }])->withCount('members');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%")
                  ->orWhereHas('members', function ($m) use ($search) {
                      $m->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%");
                  });
            });
        }

        // Size filter: small = 1-2 people, medium = 3-5, large = 6 or more.
        match ($request->input('size')) {
            'small' => $query->has('members', '<=', 2),
            'medium' => $query->has('members', '>=', 3)->has('members', '<=', 5),
            'large' => $query->has('members', '>=', 6),
            default => null,
        };

        match ($request->input('sort')) {
            'oldest' => $query->orderBy('id'),
            'code' => $query->orderBy('code'),
            'members' => $query->orderByDesc('members_count')->orderByDesc('id'),
            'members_asc' => $query->orderBy('members_count')->orderByDesc('id'),
            default => $query->orderByDesc('id'),
        };

        return response()->json($query->paginate(20));
    }

    public function show($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $household = Household::with(['members' => function ($q) {
            $q->select($this->memberFields())->orderByDesc('is_household_head');
        }])->findOrFail($id);

        return response()->json($household);
    }

    public function store(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // One household is created at a time: the next HH-#### code is derived
        // from the latest row, so two parallel creates would otherwise both
        // pick the same code and one would fail with a raw database error.
        return $this->exclusively('household-create', fn () => $this->storeHousehold($request));
    }

    private function storeHousehold(Request $request)
    {

        // A household must be created WITH a head -- the head is the one
        // person event SMS is sent to, so a headless household silently
        // receives nothing. Members are optional extras; the head always
        // counts as a member of the household.
        $request->validate([
            'address'         => 'nullable|string|max:255',
            'contact_number'  => $this->phoneRule(),
            'head_user_id'    => 'required|integer|exists:users,id',
            'member_ids'      => 'nullable|array',
            'member_ids.*'    => 'integer|exists:users,id',
        ], [
            'head_user_id.required' => 'Please choose a head of household.',
        ]);

        $memberIds = collect($request->member_ids ?? [])
            ->push((int) $request->head_user_id)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        // Everyone being linked in must be an active resident/staff who is
        // not already in another household.
        $eligible = User::whereIn('id', $memberIds)
            ->whereNull('household_id')
            ->whereNull('deleted_at')
            ->whereIn('role', ['Resident', 'Staff'])
            ->pluck('id');

        if ($eligible->count() !== $memberIds->count()) {
            return response()->json([
                'message' => 'One or more selected residents already belong to a household. Please refresh and try again.',
            ], 422);
        }

        DB::beginTransaction();
        try {
            $household = Household::create([
                'code'            => Household::generateCode(),
                'address'         => $request->address,
                'contact_number'  => $this->normalizePhone($request->contact_number),
            ]);

            // A resident being linked in never carries a stale
            // is_household_head flag from wherever they were before.
            // This is a CLAIM, not a blind write: it only touches people who
            // still have no household. If someone else grabbed one of them
            // after the check above, fewer rows change and we roll back,
            // instead of silently pulling them out of the other household.
            $claimed = User::whereIn('id', $memberIds)->whereNull('household_id')->update([
                'household_id'      => $household->id,
                'is_household_head' => false,
            ]);
            if ($claimed !== $memberIds->count()) {
                DB::rollBack();
                return response()->json([
                    'message' => 'One or more selected residents already belong to a household. Please refresh and try again.',
                ], 422);
            }

            $head = User::find($request->head_user_id);
            $head->update(['is_household_head' => true]);
            $household->backfillFromHead($head);

            DB::commit();

            $this->createLog('Create', "Created household '{$household->code}'");

            return response()->json(
                $household->load('members'),
                201
            );
        } catch (\Exception $e) {
            DB::rollBack();

            if ($this->isHeadConflict($e)) {
                return response()->json([
                    'message' => 'The chosen head already leads another household. Please refresh and try again.',
                ], 409);
            }

            return response()->json(['message' => 'Failed to create household: ' . $this->safeError($e)], 500);
        }
    }

    /**
     * Same phone rule the Residents form uses (09xx xxx xxxx, with or without
     * dashes, spaces or +63). Blank is allowed -- the head's own number is then used.
     */
    private function phoneRule(): array
    {
        return [
            'nullable',
            'string',
            function ($attribute, $value, $fail) {
                $digits = preg_replace('/\D/', '', (string) $value);
                if (trim((string) $value) !== '' && ! preg_match('/^(63|0)9\d{9}$/', $digits)) {
                    $fail('The contact number format is invalid.');
                }
            },
        ];
    }

    /** Digits only (what the SMS service is given), or null when blank. */
    private function normalizePhone(mixed $value): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $value);

        return $digits === '' ? null : $digits;
    }

    private function fullName(User $user): string
    {
        return trim($user->first_name . ' ' . $user->last_name);
    }

    /** "<name> is no longer in this household" -- the answer to a screen that was open too long. */
    private function notInHouseholdResponse(?User $user)
    {
        $name = $user ? $this->fullName($user) : 'This resident';

        return response()->json([
            'message' => "{$name} is no longer in this household. Please refresh and try again.",
        ], 422);
    }

    public function update(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'address'        => 'sometimes|nullable|string|max:255',
            'contact_number' => array_merge(['sometimes'], $this->phoneRule()),
        ]);

        return $this->exclusively("household-{$id}", fn () => DB::transaction(function () use ($request, $id) {
            $household = Household::lockForUpdate()->findOrFail($id);

            // Only the fields that were actually sent are changed, so a request
            // that leaves one out can never blank it.
            $changes = [];
            if ($request->exists('address')) {
                $changes['address'] = filled($request->input('address')) ? trim($request->input('address')) : null;
            }
            if ($request->exists('contact_number')) {
                $changes['contact_number'] = $this->normalizePhone($request->input('contact_number'));
            }
            if ($changes) {
                $household->update($changes);
            }

            // Keep the head's own resident record in step with a NEW address/number,
            // but a blank never overwrites what the head already has -- clearing the
            // household's number must not wipe the head's personal one.
            $head = User::where('household_id', $household->id)->where('is_household_head', true)->lockForUpdate()->first();
            $sync = array_filter($changes, fn ($v) => filled($v));
            if ($head && $sync) {
                $head->update($sync);
            }

            $this->createLog('Update', "Updated household '{$household->code}'");

            return response()->json($household->load('members'));
        }));
    }

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return $this->exclusively("household-{$id}", fn () => DB::transaction(function () use ($id) {
            $household = Household::lockForUpdate()->findOrFail($id);

            // Un-link members rather than blocking the delete -- but remember who
            // they were (and who the head was), so restoring the household from the
            // Archive can put them back. Unlinking and archiving happen together or
            // not at all.
            $members = User::where('household_id', $household->id)->lockForUpdate()->get(['id', 'is_household_head']);
            $household->dissolved_members = [
                'members' => $members->pluck('id')->all(),
                'head'    => $members->first(fn ($m) => (bool) $m->is_household_head)?->id,
            ];

            User::where('household_id', $household->id)->update([
                'household_id'      => null,
                'is_household_head' => false,
            ]);

            $code = $household->code;
            $household->deleted_by = auth()->user()->user_code;
            $household->save();
            $household->delete();

            $this->createLog('Delete', "Deleted household '{$code}'");

            return response()->json(['message' => 'Household deleted successfully']);
        }));
    }

    /**
     * Add an existing resident to a household. Conditional claim: only a resident
     * who has no household yet can be added, so two staff adding the same person to
     * two households at once can't steal them from each other. (Already in THIS
     * household is a harmless no-op.) A resident coming in never carries a head flag
     * with them -- who heads THIS household is a fresh decision.
     */
    public function addMember(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        return $this->exclusively("household-{$id}", fn () => DB::transaction(function () use ($request, $id) {
            $household = Household::lockForUpdate()->findOrFail($id);
            $user = User::findOrFail($request->user_id);

            if ((int) $user->household_id !== (int) $household->id) {
                $claimed = User::where('id', $user->id)->whereNull('household_id')->update([
                    'household_id'      => $household->id,
                    'is_household_head' => false,
                ]);
                if (!$claimed) {
                    return response()->json([
                        'message' => 'One or more selected residents already belong to a household. Please refresh and try again.',
                    ], 422);
                }
                $user->refresh();
            }

            $this->createLog('Update', "Added {$user->first_name} {$user->last_name} to household '{$household->code}'");

            return response()->json($household->load('members'));
        }));
    }

    /**
     * Remove a member from a household (they become unlinked, not deleted).
     */
    public function removeMember($id, $userId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return $this->exclusively("household-{$id}", fn () => DB::transaction(function () use ($id, $userId) {
            $household = Household::lockForUpdate()->findOrFail($id);
            $user = User::findOrFail($userId);

            $wasHead = (bool) User::where('id', $user->id)->where('household_id', $household->id)->lockForUpdate()->value('is_household_head');

            // Conditional on still being in THIS household: if someone else already
            // moved or removed them, nothing changes and the staff member is told so.
            $changed = User::where('id', $user->id)->where('household_id', $household->id)->update([
                'household_id'      => null,
                'is_household_head' => false,
            ]);
            if (!$changed) {
                return $this->notInHouseholdResponse($user);
            }

            $this->createLog('Update', "Removed {$user->first_name} {$user->last_name} from household '{$household->code}'");

            if ($wasHead) {
                $this->createLog('Warning', "Household '{$household->code}' now has no head of household -- event SMS will not reach it until a new head is assigned");
            }

            return response()->json($household->load('members'));
        }));
    }

    /**
     * Set (or clear) which member is the household head -- only one head
     * per household receives the event SMS.
     */
    public function setHead(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'user_id' => 'nullable|integer|exists:users,id',
        ]);

        return $this->exclusively("household-{$id}", fn () => $this->setHeadLocked($request, (int) $id));
    }

    private function setHeadLocked(Request $request, int $id)
    {
        $household = Household::findOrFail($id);

        DB::beginTransaction();
        try {
            // Lock this household's members for the swap so a concurrent
            // "set head" or "remove" on the same household can't interleave
            // between the demote and the promote below.
            User::where('household_id', $household->id)->lockForUpdate()->get();

            $user = null;
            if ($request->filled('user_id')) {
                $user = User::where('household_id', $household->id)->where('id', $request->user_id)->first();
                if (!$user) {
                    DB::rollBack();

                    return $this->notInHouseholdResponse(User::find($request->user_id));
                }
            }

            User::where('household_id', $household->id)->update(['is_household_head' => false]);

            if ($user) {
                // Conditional on still being a member: a head flag can never be
                // written onto someone who just left.
                $promoted = User::where('id', $user->id)->where('household_id', $household->id)->update(['is_household_head' => true]);
                if (!$promoted) {
                    DB::rollBack();

                    return $this->notInHouseholdResponse($user);
                }
                // $household->backfillFromHead($user);
                // $this->createLog('Update', "Set {$user->first_name} {$user->last_name} as head of household '{$household->code}'");

                $household->update([
                    'address'        => $user->address ?: $household->address,
                    'contact_number' => $user->contact_number ?: $household->contact_number,
                ]);
                $this->createLog('Update', "Set {$user->first_name} {$user->last_name} as head of household '{$household->code}'");
            }

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();

            if ($this->isHeadConflict($e)) {
                return response()->json([
                    'message' => 'Another staff member just set a head for this household. Please refresh and try again.',
                ], 409);
            }

            return response()->json(['message' => 'Failed to set household head: ' . $this->safeError($e)], 500);
        }

        return response()->json($household->load('members'));
    }

    /**
     * True when $e is the DB rejecting a second is_household_head = true
     * row for the same household (see the users_one_head_per_household
     * unique index) -- the rare case of two truly concurrent requests
     * both passing the PHP-level "no head yet" check before either
     * commits. Lets callers turn that into a friendly message instead of
     * a raw SQL error.
     */
    private function isHeadConflict(\Throwable $e): bool
    {
        return $e instanceof \Illuminate\Database\QueryException
            && str_contains($e->getMessage(), 'users_one_head_per_household');
    }

    /**
     * Residents not currently linked to any household -- used by the
     * frontend's "add member" picker.
     */
    public function unassigned(Request $request)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Both Residents and Staff can belong to a household -- a barangay
        // staff member may live with a resident family and still needs to
        // show up in that household's member list.
        $query = User::whereNull('household_id')
            ->whereIn('role', ['Resident', 'Staff'])
            ->whereNull('deleted_at')
            ->select($this->memberFields())
            ->orderBy('last_name');

        // paged=1 (the resident pickers): the typed search is matched by the database and
        // only the first matches come back, with the size of the whole pool.
        if ($request->boolean('paged')) {
            $total = (clone $query)->count();
            if ($request->filled('exclude')) {
                $query->where('id', '!=', (int) $request->input('exclude'));
            }
            foreach (Paged::tokens($request->input('search')) as $word) {
                $like = Paged::like($word);
                $query->where(fn ($q) => $q->whereRaw("LOWER(CONCAT_WS(' ', first_name, middle_name, last_name)) LIKE ?", [$like])
                    ->orWhereRaw('LOWER(COALESCE(user_code, \'\')) LIKE ?', [$like]));
            }

            return response()->json(['data' => $query->limit(Paged::perPage($request, 30, 100))->get(), 'total' => $total]);
        }

        return response()->json($query->get());
    }

    /**
     * Households that currently have no head of household. Computed live
     * (not stored) so the warning is always accurate and clears by itself
     * the moment a head is assigned -- whether the head was removed, the
     * head's resident record was archived, or the household predates the
     * "head required" rule.
     */
    public function alerts()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $households = Household::withCount('members')
            ->whereDoesntHave('head')
            ->orderBy('code')
            ->get(['id', 'code', 'address', 'contact_number']);

        return response()->json($households);
    }

    /**
     * Flat, unpaginated {id, code, address} list for pickers -- e.g. the
     * "link this resident to a household" combobox on the Residents form.
     * index() is paginated and eager-loads full member lists, which is
     * more than a simple dropdown needs.
     */
    public function options()
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(
            Household::orderBy('code')->get(['id', 'code', 'address'])
        );
    }
}

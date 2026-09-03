<?php

namespace App\Http\Controllers;

use App\Models\Household;
use App\Models\User;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HouseholdController extends Controller
{
    private function isStaff()
    {
        return auth()->user()?->role === 'Staff';
    }

    private function createLog($action, $description)
    {
        ActivityLog::create([
            'user_code'   => auth()->user()?->user_code ?? 'SYSTEM',
            'action'      => $action,
            'module'      => 'Households',
            'description' => $description,
        ]);
    }

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

        return response()->json(
            $query->orderByDesc('id')->paginate(20)
        );
    }

    public function show($id)
    {
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

        $request->validate([
            'address'         => 'nullable|string|max:255',
            'contact_number'  => 'nullable|string|max:15',
            'member_ids'      => 'nullable|array',
            'member_ids.*'    => 'integer|exists:users,id',
            'head_user_id'    => 'nullable|integer|exists:users,id',
        ]);

        DB::beginTransaction();
        try {
            $household = Household::create([
                'code'            => Household::generateCode(),
                'address'         => $request->address,
                'contact_number'  => $request->contact_number,
            ]);

            $memberIds = $request->member_ids ?? [];
            if (!empty($memberIds)) {
                User::whereIn('id', $memberIds)->update([
                    'household_id' => $household->id,
                ]);
            }

            if ($request->filled('head_user_id') && in_array($request->head_user_id, $memberIds)) {
                // Only one head per household -- clear any stale flag first.
                User::where('household_id', $household->id)->update(['is_household_head' => false]);
                User::where('id', $request->head_user_id)->update(['is_household_head' => true]);
            }

            DB::commit();

            $this->createLog('Create', "Created household '{$household->code}'");

            return response()->json(
                $household->load('members'),
                201
            );
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to create household: ' . $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $household = Household::findOrFail($id);

        $request->validate([
            'address'        => 'nullable|string|max:255',
            'contact_number' => 'nullable|string|max:15',
        ]);

        $household->update([
            'address'        => $request->address,
            'contact_number' => $request->contact_number,
        ]);

        $this->createLog('Update', "Updated household '{$household->code}'");

        return response()->json($household->load('members'));
    }

    public function destroy($id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $household = Household::findOrFail($id);

        // Un-link members rather than blocking the delete -- a household
        // being dissolved shouldn't hold its residents hostage.
        User::where('household_id', $household->id)->update([
            'household_id'      => null,
            'is_household_head' => false,
        ]);

        $code = $household->code;
        $household->delete();

        $this->createLog('Delete', "Deleted household '{$code}'");

        return response()->json(['message' => 'Household deleted successfully']);
    }

    /**
     * Add an existing resident to a household.
     */
    public function addMember(Request $request, $id)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $household = Household::findOrFail($id);

        $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $user = User::findOrFail($request->user_id);
        $user->update(['household_id' => $household->id]);

        $this->createLog('Update', "Added {$user->first_name} {$user->last_name} to household '{$household->code}'");

        return response()->json($household->load('members'));
    }

    /**
     * Remove a member from a household (they become unlinked, not deleted).
     */
    public function removeMember($id, $userId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $household = Household::findOrFail($id);
        $user = User::where('household_id', $household->id)->findOrFail($userId);

        $user->update([
            'household_id'      => null,
            'is_household_head' => false,
        ]);

        $this->createLog('Update', "Removed {$user->first_name} {$user->last_name} from household '{$household->code}'");

        return response()->json($household->load('members'));
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

        $household = Household::findOrFail($id);

        $request->validate([
            'user_id' => 'nullable|integer|exists:users,id',
        ]);

        User::where('household_id', $household->id)->update(['is_household_head' => false]);

        if ($request->filled('user_id')) {
            $user = User::where('household_id', $household->id)->findOrFail($request->user_id);
            $user->update(['is_household_head' => true]);
            $this->createLog('Update', "Set {$user->first_name} {$user->last_name} as head of household '{$household->code}'");
        }

        return response()->json($household->load('members'));
    }

    /**
     * Residents not currently linked to any household -- used by the
     * frontend's "add member" picker.
     */
    public function unassigned()
    {
        // Both Residents and Staff can belong to a household -- a barangay
        // staff member may live with a resident family and still needs to
        // show up in that household's member list.
        $residents = User::whereNull('household_id')
            ->whereIn('role', ['Resident', 'Staff'])
            ->whereNull('deleted_at')
            ->select($this->memberFields())
            ->orderBy('last_name')
            ->get();

        return response()->json($residents);
    }
}

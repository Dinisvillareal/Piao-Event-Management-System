<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\EventExpense;
use App\Models\ActivityLog;
use App\Support\PhotoSet;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class EventExpenseController extends Controller
{
    // Same upload convention as UserController::localUpload/localDelete --
    // a receipt is optional proof-of-purchase for transparency, stored on
    // the public disk so it can be viewed/downloaded via receipt_url
    // (see EventExpense::getReceiptUrlAttribute).
    private function localUpload($file): string
    {
        $original = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $ext      = $file->getClientOriginalExtension();
        $clean    = preg_replace('/[^A-Za-z0-9\-_.]/', '_', $original);
        $filename = time() . '_' . $clean . '.' . $ext;

        $path = $file->storeAs('expense_receipts', $filename, 'public');

        if (!$path) {
            throw new \Exception('File upload failed');
        }

        return $path;
    }

    private function localDelete(?string $path): void
    {
        if (!$path) {
            return;
        }
        try {
            Storage::disk('public')->delete($path);
        } catch (\Exception $e) {
            \Log::warning($e->getMessage());
        }
    }

    /**
     * A receipt is either up to 5 photos or exactly one PDF -- a PDF can't be
     * combined with other files. Checked from the request before anything is
     * uploaded or changed. Returns the number of files the receipt will have.
     */
    private function checkReceiptSet(array $current, Request $request): int
    {
        $plan = PhotoSet::plan($current, $request, PhotoSet::MAX, 'keep_receipts', 'receipts');
        $isPdf = fn (string $ext) => strtolower($ext) === 'pdf';

        $total = count($plan['kept']) + count($plan['files']);
        $hasPdf = false;
        foreach ($plan['kept'] as $path) {
            $hasPdf = $hasPdf || $isPdf(pathinfo($path, PATHINFO_EXTENSION));
        }
        foreach ($plan['files'] as $file) {
            $hasPdf = $hasPdf || $isPdf($file->getClientOriginalExtension());
        }

        if ($hasPdf && $total > 1) {
            throw ValidationException::withMessages([
                'receipts' => 'Attach either one PDF or up to 5 photos -- a PDF can\'t be combined with other files.',
            ]);
        }

        return $total;
    }

    /**
     * Budget standing of an event right after a change, returned with every
     * add/update/delete so the UI can show exactly where the event stands
     * (and the activity log can say so) without a second request.
     * approved_budget is a soft cap: going over is allowed, just flagged.
     */
    private function budgetFigures(Event $event): array
    {
        $total = round((float) $event->total_expenses, 2);
        $approved = $event->approved_budget !== null ? (float) $event->approved_budget : null;

        return [
            'total_expenses' => $total,
            'is_over_budget' => $event->is_over_budget,
            'remaining' => $approved !== null ? round($approved - $total, 2) : null,
            'over_by' => $approved !== null ? round(max(0, $total - $approved), 2) : 0,
        ];
    }

    /** Suffix appended to an activity-log line when the event is over budget. */
    private function overBudgetNote(Event $event): string
    {
        $figures = $this->budgetFigures($event);
        if (!$figures['is_over_budget']) {
            return '';
        }

        return ' -- event is now PHP ' . number_format($figures['over_by'], 2)
            . ' over its approved budget (PHP ' . number_format((float) $event->approved_budget, 2) . ')';
    }

    // UC-8: Record Event Budget and Expenses
    public function index($eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event = Event::withoutTrashed()->findOrFail($eventId);

        return response()->json(array_merge([
            'approved_budget' => $event->approved_budget,
            'expenses' => $event->expenses()->latest()->get(),
        ], $this->budgetFigures($event)));
    }

    public function store(Request $request, $eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'item' => 'required|string|max:150',
            'amount' => 'required|numeric|min:0',
            'notes' => 'nullable|string|max:255',
            // A receipt is mandatory when recording a new expense --
            // transparency was the whole point of this feature, so an
            // expense can't exist without one from the start (see update()
            // below for why an existing one also can't be removed outright
            // once attached).
            'receipt' => 'required_without:receipts|file|mimes:jpg,jpeg,png,pdf|max:5120',
            // Up to 5 photos, or one PDF (see checkReceiptSet).
            'receipts' => 'required_without:receipt|array|min:1|max:5',
            'receipts.*' => 'file|mimes:jpg,jpeg,png,pdf|max:5120',
        ]);

        $event = Event::withoutTrashed()->findOrFail($eventId);

        if ($request->hasFile('receipts')) {
            $this->checkReceiptSet([], $request);
            $paths = PhotoSet::resolve([], $request, fn ($f) => $this->localUpload($f), PhotoSet::MAX, 'keep_receipts', 'receipts')['final'];
        } else {
            $paths = [$this->localUpload($request->file('receipt'))];
        }
        $receiptPath = $paths[0];

        $expense = $event->expenses()->create([
            'item' => $request->item,
            'amount' => $request->amount,
            'notes' => $request->notes,
            'receipt_path' => $receiptPath,
            'extra_receipt_paths' => count($paths) > 1 ? array_slice($paths, 1) : null,
            'recorded_by' => auth()->user()->user_code,
        ]);

        $event->refresh();

        ActivityLog::create([
            'user_code' => auth()->user()->user_code,
            'action' => 'Create',
            'module' => 'Budget',
            'description' => "Recorded expense '{$expense->item}' (PHP {$expense->amount}) for event: {$event->name}" . $this->overBudgetNote($event),
        ]);

        return response()->json(array_merge([
            'message' => 'Expense recorded',
            'expense' => $expense,
        ], $this->budgetFigures($event)), 201);
    }

    public function update(Request $request, $eventId, $expenseId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'item' => 'required|string|max:150',
            'amount' => 'required|numeric|min:0',
            'notes' => 'nullable|string|max:255',
            'receipt' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:5120',
            // The whole receipt list: keep_receipts[] = indexes of the saved
            // files to keep, receipts[] = new files (photos, or one PDF).
            'receipts_sync' => 'nullable|boolean',
            'receipts' => 'nullable|array|max:5',
            'receipts.*' => 'file|mimes:jpg,jpeg,png,pdf|max:5120',
            'keep_receipts' => 'nullable|array',
            'keep_receipts.*' => 'integer|min:0',
        ]);

        $event = Event::withoutTrashed()->findOrFail($eventId);
        $expense = EventExpense::where('event_id', $eventId)->findOrFail($expenseId);

        if ($request->boolean('receipts_sync') && $this->checkReceiptSet($expense->allReceiptPaths(), $request) === 0) {
            return response()->json([
                'message' => 'A receipt is required. Attach a replacement before removing the current one.',
            ], 422);
        }

        $updateData = [
            'item' => $request->item,
            'amount' => $request->amount,
            'notes' => $request->notes,
        ];

        // A new file replaces whatever was there before, and the
        // now-orphaned old file is deleted from disk (not just the DB
        // pointer to it). A receipt can never be removed outright once an
        // expense has one -- "remove_receipt" alone (no replacement file)
        // is rejected rather than silently nulling the path, since that
        // would leave the expense with no receipt at all.
        $removedReceipts = [];
        if ($request->boolean('receipts_sync')) {
            $res = PhotoSet::resolve($expense->allReceiptPaths(), $request, fn ($f) => $this->localUpload($f), PhotoSet::MAX, 'keep_receipts', 'receipts');
            $updateData['receipt_path'] = $res['final'][0];
            $updateData['extra_receipt_paths'] = count($res['final']) > 1 ? array_slice($res['final'], 1) : null;
            $removedReceipts = $res['removed'];
        } elseif ($request->hasFile('receipt')) {
            $this->localDelete($expense->receipt_path);
            $updateData['receipt_path'] = $this->localUpload($request->file('receipt'));
        } elseif ($request->boolean('remove_receipt') && $expense->receipt_path) {
            return response()->json([
                'message' => 'A receipt is required. Attach a replacement before removing the current one.',
            ], 422);
        }

        $oldAmount = (float) $expense->amount;
        $wasOver = $event->is_over_budget;

        $expense->update($updateData);
        foreach ($removedReceipts as $gone) {
            $this->localDelete($gone);
        }

        $event->refresh();

        // Say what actually changed in the amount -- that's the number that
        // moves the event's budget standing -- and whether the edit pushed
        // the event over (or back within) its approved budget.
        $amountNote = abs($oldAmount - (float) $expense->amount) > 0.004
            ? ' (amount PHP ' . number_format($oldAmount, 2) . ' -> PHP ' . number_format((float) $expense->amount, 2) . ')'
            : " (PHP {$expense->amount})";
        $standing = $this->overBudgetNote($event);
        if ($standing === '' && $wasOver) {
            $standing = ' -- event is back within its approved budget';
        }

        ActivityLog::create([
            'user_code' => auth()->user()->user_code,
            'action' => 'Update',
            'module' => 'Budget',
            'description' => "Updated expense '{$expense->item}'{$amountNote} for event: {$event->name}" . $standing,
        ]);

        return response()->json(array_merge([
            'message' => 'Expense updated',
            'expense' => $expense,
        ], $this->budgetFigures($event)));
    }

    // Soft delete -- the row is kept (deleted_at set) instead of being
    // permanently removed, matching every other "delete" action in the
    // app (events, residents, inventory, memberships, age brackets, civil
    // statuses). No restore UI is wired up for expenses specifically yet,
    // but the record survives and can be recovered directly if needed.
    public function destroy($eventId, $expenseId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event = Event::withoutTrashed()->findOrFail($eventId);
        $expense = EventExpense::where('event_id', $eventId)->findOrFail($expenseId);
        $itemName = $expense->item;
        $amount = $expense->amount;
        $wasOver = $event->is_over_budget;
        $expense->delete();

        $event->refresh();

        $standing = $this->overBudgetNote($event);
        if ($standing === '' && $wasOver) {
            $standing = ' -- event is back within its approved budget';
        }

        ActivityLog::create([
            'user_code' => auth()->user()->user_code,
            'action' => 'Delete',
            'module' => 'Budget',
            'description' => "Removed expense '{$itemName}' (PHP {$amount}) from event: {$event->name}" . $standing,
        ]);

        return response()->json(array_merge([
            'message' => 'Expense removed',
        ], $this->budgetFigures($event)));
    }

    // Set or change an event's approved budget straight from the Budget &
    // Expenses workspace (used on both the Budget page and an event's own
    // Budget tab), instead of only through the full Edit Event form. Allowed
    // while the event is Upcoming or Ongoing -- raising the budget is the
    // natural fix for an over-budget event -- but not once it has ended.
    public function updateBudget(Request $request, $eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'approved_budget' => 'nullable|numeric|min:0|max:99999999.99',
        ]);

        $event = Event::withoutTrashed()->findOrFail($eventId);

        $end = $event->event_end ?? $event->call_time_end ?? optional($event->event_start)->copy()->endOfDay();
        if ($end && now()->gt($end)) {
            return response()->json([
                'message' => 'This event has already ended, so its approved budget can no longer be changed.',
            ], 422);
        }

        $old = $event->approved_budget;
        $new = $request->filled('approved_budget') ? round((float) $request->approved_budget, 2) : null;

        if ($old !== null && $new !== null && (float) $old === $new) {
            return response()->json(array_merge([
                'message' => 'Approved budget unchanged',
                'approved_budget' => $event->approved_budget,
            ], $this->budgetFigures($event)));
        }

        $event->approved_budget = $new;
        $event->save();
        $event->refresh();

        $fmt = fn ($n) => $n === null ? 'none' : 'PHP ' . number_format((float) $n, 2);
        ActivityLog::create([
            'user_code' => auth()->user()->user_code,
            'action' => 'Update',
            'module' => 'Budget',
            'description' => "Changed approved budget for event: {$event->name} from {$fmt($old)} to {$fmt($new)}" . $this->overBudgetNote($event),
        ]);

        return response()->json(array_merge([
            'message' => 'Approved budget updated',
            'approved_budget' => $event->approved_budget,
        ], $this->budgetFigures($event)));
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\EventExpense;
use App\Models\ActivityLog;
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

    // UC-8: Record Event Budget and Expenses
    public function index($eventId)
    {
        if (!$this->isStaff()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event = Event::withoutTrashed()->findOrFail($eventId);

        return response()->json([
            'approved_budget' => $event->approved_budget,
            'total_expenses' => $event->total_expenses,
            'is_over_budget' => $event->is_over_budget,
            'expenses' => $event->expenses()->latest()->get(),
        ]);
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
            'receipt' => 'required|file|mimes:jpg,jpeg,png,pdf|max:5120',
        ]);

        $event = Event::withoutTrashed()->findOrFail($eventId);

        $receiptPath = $this->localUpload($request->file('receipt'));

        $expense = $event->expenses()->create([
            'item' => $request->item,
            'amount' => $request->amount,
            'notes' => $request->notes,
            'receipt_path' => $receiptPath,
            'recorded_by' => auth()->user()->user_code,
        ]);

        ActivityLog::create([
            'user_code' => auth()->user()->user_code,
            'action' => 'Create',
            'module' => 'Budget',
            'description' => "Recorded expense '{$expense->item}' (PHP {$expense->amount}) for event: {$event->name}",
        ]);

        $event->refresh();

        return response()->json([
            'message' => 'Expense recorded',
            'expense' => $expense,
            'total_expenses' => $event->total_expenses,
            'is_over_budget' => $event->is_over_budget,
        ], 201);
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
        ]);

        $event = Event::withoutTrashed()->findOrFail($eventId);
        $expense = EventExpense::where('event_id', $eventId)->findOrFail($expenseId);

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
        if ($request->hasFile('receipt')) {
            $this->localDelete($expense->receipt_path);
            $updateData['receipt_path'] = $this->localUpload($request->file('receipt'));
        } elseif ($request->boolean('remove_receipt') && $expense->receipt_path) {
            return response()->json([
                'message' => 'A receipt is required. Attach a replacement before removing the current one.',
            ], 422);
        }

        $expense->update($updateData);

        ActivityLog::create([
            'user_code' => auth()->user()->user_code,
            'action' => 'Update',
            'module' => 'Budget',
            'description' => "Updated expense '{$expense->item}' (PHP {$expense->amount}) for event: {$event->name}",
        ]);

        $event->refresh();

        return response()->json([
            'message' => 'Expense updated',
            'expense' => $expense,
            'total_expenses' => $event->total_expenses,
            'is_over_budget' => $event->is_over_budget,
        ]);
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
        $expense->delete();

        ActivityLog::create([
            'user_code' => auth()->user()->user_code,
            'action' => 'Delete',
            'module' => 'Budget',
            'description' => "Removed expense '{$itemName}' from event: {$event->name}",
        ]);

        $event->refresh();

        return response()->json([
            'message' => 'Expense removed',
            'total_expenses' => $event->total_expenses,
            'is_over_budget' => $event->is_over_budget,
        ]);
    }
}

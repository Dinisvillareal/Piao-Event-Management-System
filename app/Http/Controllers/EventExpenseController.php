<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\EventExpense;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class EventExpenseController extends Controller
{
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
        ]);

        $event = Event::withoutTrashed()->findOrFail($eventId);

        $expense = $event->expenses()->create([
            'item' => $request->item,
            'amount' => $request->amount,
            'notes' => $request->notes,
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
        ]);

        $event = Event::withoutTrashed()->findOrFail($eventId);
        $expense = EventExpense::where('event_id', $eventId)->findOrFail($expenseId);

        $expense->update([
            'item' => $request->item,
            'amount' => $request->amount,
            'notes' => $request->notes,
        ]);

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

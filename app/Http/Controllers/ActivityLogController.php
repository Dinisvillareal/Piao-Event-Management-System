<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = ActivityLog::query();

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('user_code', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('module', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        // IMPORTANT: ensure created_at is included and sorted properly
        return response()->json(
            $query->orderBy('created_at', 'desc')->paginate(20)
        );
    }

    public function show($id)
    {
        return response()->json(
            ActivityLog::findOrFail($id)
        );
    }
}

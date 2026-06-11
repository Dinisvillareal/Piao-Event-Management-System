<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Carbon\Carbon;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = ActivityLog::query();

        // 🔍 SEARCH FILTER
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('user_code', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('module', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        // 🏷️ TYPE FILTER (matches what we send from React)
        if ($request->filled('type') && $request->type !== 'all') {
            // Map our frontend type names to actual module names in DB
            $moduleMap = [
                'event'        => 'Events',
                'resident'     => 'User',
                'membership'   => 'Membership',
                'notification'=> 'Notifications',
                'scan'         => 'QR',
                'system'       => 'Authentication',
            ];

            if (isset($moduleMap[$request->type])) {
                $query->where('module', $moduleMap[$request->type]);
            }
        }

        // 📅 DATE FILTER
        if ($request->filled('date')) {
            // Parse date in Asia/Manila timezone
            $chosenDate = Carbon::parse($request->date, 'Asia/Manila')->startOfDay();
            $nextDay = (clone $chosenDate)->addDay()->startOfDay();

            $query->whereBetween('created_at', [
                $chosenDate,
                $nextDay
            ]);
        }

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

    public function today(Request $request)
    {
        $query = ActivityLog::query()
            ->whereDate('created_at', now()->timezone('Asia/Manila'));

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('user_code', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('module', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        return response()->json(
            $query->orderBy('created_at', 'desc')->paginate(20)
        );
    }
}

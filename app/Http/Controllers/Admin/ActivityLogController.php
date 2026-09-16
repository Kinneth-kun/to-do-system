<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = ActivityLog::query()->with('user')->latest('created_at');

        if ($request->filled('action')) {
            $query->where('action', 'like', $request->string('action')->trim().'%');
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }

        return view('admin.activity-logs.index', [
            'logs' => $query->paginate(30)->withQueryString(),
            'users' => \App\Models\User::query()->orderBy('name')->get(['id', 'name']),
        ]);
    }
}

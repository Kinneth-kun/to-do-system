<?php

namespace App\Http\Controllers;

use App\Enums\TaskStatus;
use App\Models\Task;
use App\Services\TaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\View\View;

class TaskUpdateController extends Controller
{
    public function index(Request $request, Task $task): View
    {
        Gate::authorize('view', $task);
        $updates = $task->updates()->with('user')->paginate(25)->withQueryString();

        return view('tasks.updates', compact('task', 'updates'));
    }

    public function store(Request $request, Task $task): RedirectResponse|JsonResponse
    {
        Gate::authorize('update', $task);
        $data = $request->validate(['status' => ['nullable', 'string', 'in:pending,in_progress,completed,delayed,on_hold,cancelled'], 'progress' => ['nullable', 'integer', 'min:0', 'max:100'], 'remark' => ['nullable', 'string', 'max:2000']]);
        TaskService::applyUpdate($task, $request->user(), $data['status'] ?? null, $data['progress'] ?? null, $data['remark'] ?? null);
        $task->refresh();
        if ($request->expectsJson()) {
            return response()->json(['ok' => true, 'task' => ['id' => $task->id, 'status' => $task->status->value, 'status_label' => $task->status->label(), 'progress' => $task->progress, 'latest_remark' => $task->latest_remark]]);
        }

        return back()->with('success', 'Task updated.');
    }
}

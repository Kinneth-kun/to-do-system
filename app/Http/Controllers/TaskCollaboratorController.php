<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\User;
use App\Services\TaskService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class TaskCollaboratorController extends Controller
{
    public function store(Request $request, Task $task): RedirectResponse
    {
        Gate::authorize('manageCollaborators', $task);
        $data = $request->validate(['user_id' => ['required', 'integer', 'exists:users,id']]);
        $user = User::query()->whereKey($data['user_id'])->where('is_active', true)->firstOrFail();

        if (! TaskService::addCollaborator($task, $user, $request->user())) {
            return back()->with('warning', 'That user is already a collaborator or the assignee.');
        }

        return back()->with('success', 'Collaborator added.');
    }

    public function destroy(Request $request, Task $task, User $user): RedirectResponse
    {
        Gate::authorize('manageCollaborators', $task);
        abort_unless($user->is_active || $task->isCollaborator($user), 404);

        TaskService::removeCollaborator($task, $user, $request->user());

        return back()->with('success', 'Collaborator removed.');
    }
}

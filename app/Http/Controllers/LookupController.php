<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class LookupController extends Controller
{
    public function users(Request $request): JsonResponse
    {
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'project_id' => ['nullable', 'integer', 'exists:projects,id'], 'limit' => ['nullable', 'integer', 'min:1', 'max:50']]);
        $query = User::query()->active();
        if (filled($data['q'] ?? null)) {
            $term = '%'.$data['q'].'%';
            $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('username', 'like', $term)->orWhere('email', 'like', $term));
        }
        $project = null;
        if (! empty($data['project_id'])) {
            $project = Project::query()->visibleTo($request->user())->findOrFail($data['project_id']);
            $query->orderByRaw('CASE WHEN EXISTS (SELECT 1 FROM project_members pm WHERE pm.user_id = users.id AND pm.project_id = ?) THEN 0 ELSE 1 END', [$project->id]);
        }
        $users = $query->orderBy('name')->limit($data['limit'] ?? 10)->get();

        return response()->json(['data' => $users->map(fn (User $user) => ['id' => $user->id, 'name' => $user->name, 'username' => $user->username, 'email' => $user->email, 'job_title' => $user->job_title, 'initials' => $user->initials(), 'avatar_color' => $user->avatar_color])->values()]);
    }

    public function parentTasks(Request $request, Project $project): JsonResponse
    {
        Gate::authorize('view', $project);
        $tasks = $project->tasks()->topLevel()->orderBy('title')->get(['id', 'title']);

        return response()->json(['data' => $tasks->map(fn (Task $task) => ['id' => $task->id, 'title' => $task->title])->values()]);
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class SearchController extends Controller
{
    public function index(Request $request): View
    {
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100']]);
        $q = trim($data['q'] ?? '');
        $projects = Project::query()->visibleTo($request->user())->with('owner')->when($q, fn ($query) => $query->where('name', 'like', "%{$q}%"))->limit(20)->get();
        $tasks = Task::query()->visibleTo($request->user())->with(['project', 'assignee', 'parent', 'collaborators'])->when($q, fn ($query) => $query->where('title', 'like', "%{$q}%"))->limit(30)->get();
        $users = User::query()->active()->when($q, fn ($query) => $query->where(fn ($inner) => $inner->where('name', 'like', "%{$q}%")->orWhere('username', 'like', "%{$q}%")))->limit(20)->get();

        return view('search.index', compact('q', 'projects', 'tasks', 'users'));
    }

    public function suggest(Request $request): JsonResponse
    {
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100']]);
        $q = trim($data['q'] ?? '');
        if ($q === '') {
            return response()->json(['query' => '', 'groups' => []]);
        }
        $like = "%{$q}%";
        $projects = Project::query()->visibleTo($request->user())->with('owner')->where('name', 'like', $like)->limit(5)->get();
        $tasks = Task::query()->visibleTo($request->user())->with('project')->where('title', 'like', $like)->limit(5)->get();
        $users = User::query()->active()->where(fn ($query) => $query->where('name', 'like', $like)->orWhere('username', 'like', $like))->limit(5)->get();
        $groups = [
            ['key' => 'projects', 'label' => 'Projects', 'items' => $projects->map(fn ($project) => ['id' => $project->id, 'title' => $project->name, 'subtitle' => $project->owner?->name ?? 'Project', 'url' => route('projects.show', $project), 'badge' => ['label' => $project->health->label(), 'color' => $project->health->color()]])->values()],
            ['key' => 'tasks', 'label' => 'Tasks', 'items' => $tasks->whereNull('parent_id')->map(fn ($task) => ['id' => $task->id, 'title' => $task->title, 'subtitle' => $task->project?->name, 'url' => route('tasks.show', $task), 'badge' => ['label' => $task->status->label(), 'color' => $task->status->color()]])->values()],
            ['key' => 'subtasks', 'label' => 'Subtasks', 'items' => $tasks->whereNotNull('parent_id')->map(fn ($task) => ['id' => $task->id, 'title' => $task->title, 'subtitle' => $task->project?->name, 'url' => route('tasks.show', $task), 'badge' => ['label' => $task->status->label(), 'color' => $task->status->color()]])->values()],
            ['key' => 'users', 'label' => 'Users', 'items' => $users->map(fn ($user) => ['id' => $user->id, 'title' => $user->name, 'subtitle' => '@'.$user->username, 'url' => route('search', ['q' => $user->username]), 'badge' => null])->values()],
        ];

        return response()->json(['query' => $q, 'groups' => collect($groups)->filter(fn ($group) => $group['items']->isNotEmpty())->values()]);
    }
}

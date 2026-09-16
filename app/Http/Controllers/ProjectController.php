<?php

namespace App\Http\Controllers;

use App\Enums\Priority;
use App\Enums\ProjectStatus;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\View\View;

class ProjectController extends Controller
{
    public function index(Request $request): View
    {
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'status' => ['nullable', 'string', 'in:active,on_hold,completed,cancelled']]);
        $projects = Project::query()->visibleTo($request->user())
            ->with(['owner', 'members'])
            ->withCount(['tasks', 'allTasks'])
            ->when($filters['q'] ?? null, fn ($query, $q) => $query->where('name', 'like', "%{$q}%"))
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->latest()->paginate(15)->withQueryString();

        return view('projects.index', compact('projects', 'filters'));
    }

    public function create(Request $request): View
    {
        Gate::authorize('create', Project::class);
        $users = User::query()->active()->orderBy('name')->get();

        return view('projects.create', ['users' => $users, 'statuses' => ProjectStatus::options(), 'priorities' => Priority::options()]);
    }

    public function store(Request $request): RedirectResponse
    {
        Gate::authorize('create', Project::class);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:10000'],
            'status' => ['required', 'string', 'in:active,on_hold,completed,cancelled'], 'priority' => ['required', 'string', 'in:low,medium,high,urgent'],
            'color' => ['required', 'string', 'in:indigo,violet,sky,emerald,amber,rose,teal,fuchsia,orange,cyan'],
            'start_date' => ['nullable', 'date'], 'due_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'member_ids' => ['array'], 'member_ids.*' => ['integer', 'exists:users,id'],
        ]);
        $project = ProjectService::create($data, $request->user());

        return redirect()->route('projects.show', $project)->with('success', 'Project created.');
    }

    public function show(Request $request, Project $project): View
    {
        Gate::authorize('view', $project);
        $project->load(['owner', 'creator', 'members', 'tasks' => fn ($query) => $query->with(['project', 'assignee', 'parent', 'collaborators', 'subtasks'])]);

        return view('projects.show', compact('project'));
    }

    public function edit(Request $request, Project $project): View
    {
        Gate::authorize('update', $project);
        $users = User::query()->active()->orderBy('name')->get();

        return view('projects.edit', ['project' => $project, 'users' => $users, 'statuses' => ProjectStatus::options(), 'priorities' => Priority::options()]);
    }

    public function update(Request $request, Project $project): RedirectResponse
    {
        Gate::authorize('update', $project);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:10000'],
            'status' => ['required', 'string', 'in:active,on_hold,completed,cancelled'], 'priority' => ['required', 'string', 'in:low,medium,high,urgent'],
            'color' => ['required', 'string', 'in:indigo,violet,sky,emerald,amber,rose,teal,fuchsia,orange,cyan'],
            'owner_id' => ['required', 'integer', 'exists:users,id'], 'start_date' => ['nullable', 'date'], 'due_date' => ['nullable', 'date', 'after_or_equal:start_date'],
        ]);
        ProjectService::update($project, $data, $request->user());

        return redirect()->route('projects.show', $project)->with('success', 'Project updated.');
    }

    public function destroy(Request $request, Project $project): RedirectResponse
    {
        Gate::authorize('delete', $project);
        ProjectService::delete($project, $request->user());

        return redirect()->route('projects.index')->with('success', 'Project deleted.');
    }
}

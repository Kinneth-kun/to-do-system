<?php

namespace App\Http\Controllers;

use App\Enums\Priority;
use App\Enums\ProjectStatus;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
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

    /**
     * Create a project.
     *
     * Also serves the "create a project without leaving the task form" flow:
     *  - a JSON request gets the new project back so the page can select it in place;
     *  - a normal request with `return_to` goes back to that page with ?project_id= set,
     *    which is the no-JavaScript fallback.
     * Status, priority and colour are optional here — ProjectService fills sensible defaults —
     * so a minimal "just the name" create works.
     */
    public function store(Request $request): RedirectResponse|JsonResponse
    {
        Gate::authorize('create', Project::class);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:10000'],
            'status' => ['nullable', 'string', 'in:active,on_hold,completed,cancelled'], 'priority' => ['nullable', 'string', 'in:low,medium,high,urgent'],
            'color' => ['nullable', 'string', 'in:indigo,violet,sky,emerald,amber,rose,teal,fuchsia,orange,cyan'],
            'start_date' => ['nullable', 'date'], 'due_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'member_ids' => ['array'], 'member_ids.*' => ['integer', 'exists:users,id'],
            'return_to' => ['nullable', 'string', 'max:2000'],
        ]);

        $project = ProjectService::create(Arr::except($data, ['return_to']), $request->user());

        if ($request->expectsJson()) {
            return response()->json([
                'ok' => true,
                'project' => [
                    'id' => $project->id,
                    'name' => $project->name,
                    'color' => $project->color,
                    'url' => route('projects.show', $project),
                ],
            ], 201);
        }

        if ($path = $this->safeReturnPath($request->input('return_to'))) {
            return redirect()->to($this->appendQuery($path, ['project_id' => $project->id]))
                ->with('success', 'Project "'.$project->name.'" created — now add your task.');
        }

        return redirect()->route('projects.show', $project)->with('success', 'Project created.');
    }

    /** Only same-site relative paths, so `return_to` cannot be used as an open redirect. */
    private function safeReturnPath(?string $value): ?string
    {
        if (blank($value) || ! str_starts_with($value, '/') || str_starts_with($value, '//')) {
            return null;
        }

        return $value;
    }

    /** @param array<string, mixed> $params */
    private function appendQuery(string $path, array $params): string
    {
        [$path, $existing] = array_pad(explode('?', $path, 2), 2, '');
        parse_str($existing, $query);

        return $path.'?'.http_build_query(array_merge($query, $params));
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

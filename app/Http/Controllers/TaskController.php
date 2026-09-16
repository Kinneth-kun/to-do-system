<?php

namespace App\Http\Controllers;

use App\Enums\Department;
use App\Enums\Priority;
use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\View\View;

class TaskController extends Controller
{
    public function index(Request $request): View
    {
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'status' => ['nullable', 'string', 'in:pending,in_progress,completed,delayed,on_hold,cancelled'], 'project_id' => ['nullable', 'integer', 'exists:projects,id'], 'mine' => ['nullable', 'boolean'], 'department' => ['nullable', 'string']]);
        if (! empty($filters['project_id'])) {
            abort_unless(Project::query()->visibleTo($request->user())->whereKey($filters['project_id'])->exists(), 404);
        }
        $tasks = Task::query()->visibleTo($request->user())->with(['project', 'assignee', 'parent', 'collaborators'])
            ->when(($filters['q'] ?? null), fn ($query, $q) => $query->where('title', 'like', "%{$q}%"))
            ->when(($filters['status'] ?? null), fn ($query, $status) => $query->status($status))
            ->when(($filters['project_id'] ?? null), fn ($query, $id) => $query->where('project_id', $id))
            ->when(filter_var($filters['mine'] ?? false, FILTER_VALIDATE_BOOLEAN), fn ($query) => $query->involving($request->user()))
            ->when(Department::tryFrom((string) ($filters['department'] ?? '')), fn ($query, $department) => $query->forDepartment($department))
            ->latest('due_date')->latest()->paginate(20)->withQueryString();
        $projects = Project::query()->visibleTo($request->user())->orderBy('name')->get(['id', 'name']);

        return view('tasks.index', compact('tasks', 'projects', 'filters'));
    }

    public function create(Request $request): View
    {
        $data = $request->validate(['project_id' => ['nullable', 'integer'], 'parent_id' => ['nullable', 'integer'], 'due_date' => ['nullable', 'date'], 'assignee_id' => ['nullable', 'integer']]);
        $projects = Project::query()->visibleTo($request->user())->with('members')->orderBy('name')->get();
        $project = ! empty($data['project_id']) ? $projects->firstWhere('id', $data['project_id']) : null;
        if ($project) {
            Gate::authorize('createTask', $project);
        }
        $parent = ! empty($data['parent_id']) ? Task::query()->with('project')->findOrFail($data['parent_id']) : null;
        if ($parent) {
            Gate::authorize('addSubtask', $parent);
            $project = $parent->project;
        }
        $users = User::query()->active()->orderBy('name')->get();

        return view('tasks.create', ['projects' => $projects, 'project' => $project, 'parent' => $parent, 'users' => $users, 'priorities' => Priority::options(), 'statuses' => TaskStatus::options(), 'prefill' => $data]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'], 'parent_id' => ['nullable', 'integer', 'exists:tasks,id'], 'title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:10000'],
            'priority' => ['required', 'string', 'in:low,medium,high,urgent'], 'assignee_id' => ['nullable', 'integer', 'exists:users,id'], 'start_date' => ['nullable', 'date'], 'due_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['nullable', 'string', 'in:pending,in_progress,completed,delayed,on_hold,cancelled'], 'progress' => ['nullable', 'integer', 'min:0', 'max:100'], 'collaborator_ids' => ['array'], 'collaborator_ids.*' => ['integer', 'exists:users,id'],
        ]);
        if (! empty($data['parent_id'])) {
            $parent = Task::query()->with('project')->findOrFail($data['parent_id']);
            Gate::authorize('addSubtask', $parent);
        } else {
            $project = Project::query()->findOrFail($data['project_id']);
            Gate::authorize('createTask', $project);
        }
        $task = TaskService::create($data, $request->user());

        return redirect()->route('tasks.show', $task)
            ->with('success', 'Task created.')
            ->with($this->outsideTeamNotice($task));
    }

    public function show(Request $request, Task $task): View
    {
        Gate::authorize('view', $task);
        $task->load(['project', 'assignee', 'creator', 'parent', 'subtasks.assignee', 'subtasks.collaborators', 'collaborators', 'updates.user', 'comments.user', 'attachments.user']);

        return view('tasks.show', compact('task'));
    }

    public function edit(Request $request, Task $task): View
    {
        Gate::authorize('edit', $task);
        $task->load(['project', 'assignee', 'collaborators']);
        $users = User::query()->active()->orderBy('name')->get();

        return view('tasks.edit', ['task' => $task, 'users' => $users, 'priorities' => Priority::options()]);
    }

    public function update(Request $request, Task $task): RedirectResponse
    {
        Gate::authorize('edit', $task);
        $data = $request->validate(['title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:10000'], 'priority' => ['required', 'string', 'in:low,medium,high,urgent'], 'assignee_id' => ['nullable', 'integer', 'exists:users,id'], 'start_date' => ['nullable', 'date'], 'due_date' => ['nullable', 'date', 'after_or_equal:start_date']]);
        TaskService::updateDetails($task, $data, $request->user());

        return redirect()->route('tasks.show', $task)
            ->with('success', 'Task details updated.')
            ->with($this->outsideTeamNotice($task->fresh()));
    }

    public function destroy(Request $request, Task $task): RedirectResponse
    {
        Gate::authorize('delete', $task);
        TaskService::delete($task, $request->user());

        return redirect()->route('tasks.index')->with('success', 'Task deleted.');
    }

    /**
     * Assigning work does not grant project access — membership is always an explicit choice.
     * When the assignee is not on the team, say so rather than enrolling them silently.
     *
     * @return array<string, string>
     */
    private function outsideTeamNotice(?Task $task): array
    {
        $assignee = $task?->assignee;

        if (! $assignee || ! $task->project || $task->project->isMember($assignee)) {
            return [];
        }

        return ['warning' => $assignee->name.' is not a member of '.$task->project->name
            .'. They can still see and update this task — add them to the project team if they need the whole project.'];
    }
}

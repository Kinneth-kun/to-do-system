<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\TaskService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class QuickCreateController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate(['title' => ['required', 'string', 'max:255'], 'project_id' => ['required', 'integer', 'exists:projects,id'], 'due_date' => ['nullable', 'date']]);
        $project = Project::query()->findOrFail($data['project_id']);
        Gate::authorize('createTask', $project);
        $task = TaskService::create($data, $request->user());

        return redirect()->route('tasks.show', $task)->with('success', 'Task created.');
    }
}

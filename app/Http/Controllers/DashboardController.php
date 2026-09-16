<?php

namespace App\Http\Controllers;

use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\View\View;

class DashboardController extends Controller
{
    public function __invoke(Request $request): View
    {
        $user = $request->user();
        $projects = Project::query()->visibleTo($user)->with('owner')->withCount('tasks')->latest()->limit(6)->get();
        $base = Task::query()->visibleTo($user);
        $tasks = (clone $base)->with(['project', 'assignee', 'parent', 'collaborators'])->open()->orderBy('due_date')->limit(8)->get();
        $counts = ['open' => (clone $base)->open()->count(), 'completed' => (clone $base)->status(TaskStatus::Completed)->count(), 'delayed' => (clone $base)->status(TaskStatus::Delayed)->count(), 'due_soon' => (clone $base)->dueSoon()->count()];

        return view('dashboard.index', compact('projects', 'tasks', 'counts'));
    }
}

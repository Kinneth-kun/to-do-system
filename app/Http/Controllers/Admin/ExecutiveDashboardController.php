<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\ProjectHealthService;
use App\Enums\TaskStatus;
use Illuminate\Http\Request;

class ExecutiveDashboardController extends Controller
{
    public function __invoke(Request $request)
    {
        $projects = Project::query()->with(['owner'])->latest('updated_at')->take(8)->get();
        $projects->each(fn (Project $project) => ProjectHealthService::refresh($project));

        return view('admin.executive.index', [
            'projects' => $projects,
            'stats' => [
                'users' => User::query()->active()->count(),
                'projects' => Project::query()->active()->count(),
                'tasks' => Task::query()->count(),
                'completed' => Task::query()->status(TaskStatus::Completed)->count(),
                'delayed' => Task::query()->status(TaskStatus::Delayed)->count(),
            ],
        ]);
    }
}

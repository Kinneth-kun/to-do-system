<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Services\Settings;
use Illuminate\Http\Request;

class MeetingController extends Controller
{
    public function __invoke(Request $request)
    {
        $projects = Project::query()->active()->with(['owner'])->orderBy('due_date')->get();
        $tasks = Task::query()->visibleTo($request->user())
            ->with(['project', 'assignee'])
            ->open()->orderByRaw('due_date is null')->orderBy('due_date')->take(25)->get();

        return view('admin.meeting.index', [
            'projects' => $projects,
            'tasks' => $tasks,
            'organization' => Settings::string('general.organization'),
        ]);
    }
}

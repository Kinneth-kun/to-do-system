<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Support\Carbon;

class CalendarController extends Controller
{
    public function index(Request $request): View
    {
        $data = $request->validate(['view' => ['nullable', 'in:month,week,day'], 'date' => ['nullable', 'date_format:Y-m-d'], 'project_id' => ['nullable', 'integer'], 'scope' => ['nullable', 'in:mine,all']]);
        $view = $data['view'] ?? 'month';
        $date = Carbon::parse($data['date'] ?? today()->toDateString())->startOfDay();
        $from = $view === 'month' ? $date->copy()->startOfMonth()->startOfWeek() : ($view === 'week' ? $date->copy()->startOfWeek() : $date->copy());
        $to = $view === 'month' ? $date->copy()->endOfMonth()->endOfWeek() : ($view === 'week' ? $date->copy()->endOfWeek() : $date->copy()->endOfDay());
        $projects = Project::query()->visibleTo($request->user())->orderBy('name')->get(['id', 'name']);
        if (! empty($data['project_id'])) {
            $project = $projects->firstWhere('id', $data['project_id']);
            abort_unless($project, 404);
        }
        $tasks = Task::query()->visibleTo($request->user())->with(['project', 'assignee', 'parent'])->betweenDates($from, $to)
            ->when($data['project_id'] ?? null, fn ($query, $id) => $query->where('project_id', $id))
            ->when(($data['scope'] ?? 'all') === 'mine', fn ($query) => $query->involving($request->user()))
            ->orderBy('due_date')->get();
        $days = collect();
        for ($day = $from->copy(); $day->lte($to); $day->addDay()) {
            $days->push(['date' => $day->copy(), 'tasks' => $tasks->filter(fn (Task $task) => $task->start_date?->lte($day) && ($task->due_date ?? $task->start_date)?->gte($day) || $task->due_date?->isSameDay($day))->values()]);
        }

        return view('calendar.index', compact('view', 'date', 'from', 'to', 'tasks', 'days', 'projects', 'data'));
    }
}

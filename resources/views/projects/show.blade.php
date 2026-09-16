@php
    $counts = $project->taskCounts();
    $evaluation = \App\Services\ProjectHealthService::evaluate($project);
    $dueSoon = $project->allTasks()->dueSoon()->count();
    $candidates = auth()->user()->can('manageMembers', $project)
        ? \App\Models\User::query()->active()->whereNotIn('id', $project->members->pluck('id'))->orderBy('name')->get()
        : collect();
@endphp
<x-layouts.app :title="$project->name">
    <x-page-header :title="$project->name" :back="route('projects.index')">
        <x-slot:meta>
            <div class="mt-3 flex flex-wrap items-center gap-2">
                <x-health-badge :health="$project->health" />
                <x-project-status-badge :status="$project->status" />
                <x-priority-badge :priority="$project->priority" :show-low="false" />
                <span class="inline-flex items-center gap-1.5 text-sm text-slate-500">
                    <x-avatar :user="$project->owner" size="xs" /> {{ $project->owner?->name }}
                </span>
                @if ($project->due_date)
                    <span @class(['inline-flex items-center gap-1 text-sm', 'font-semibold text-red-600' => $project->isOverdue(), 'text-slate-500' => ! $project->isOverdue()])>
                        <x-icon name="calendar" class="h-4 w-4" />
                        {{ $project->start_date ? $project->start_date->format('M j').' – ' : 'Due ' }}{{ $project->due_date->format('M j, Y') }}
                    </span>
                @endif
            </div>
            @if ($project->description)
                <p class="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{{ $project->description }}</p>
            @endif
        </x-slot:meta>
        <x-slot:actions>
            @can('createTask', $project)
                <a href="{{ route('tasks.create', ['project_id' => $project->id]) }}" class="btn-primary"><x-icon name="plus" class="h-4 w-4" stroke="2" /> Add task</a>
            @endcan
            @can('update', $project)
                <a href="{{ route('projects.edit', $project) }}" class="btn-secondary"><x-icon name="pencil" class="h-4 w-4" /> Edit</a>
            @endcan
            @can('delete', $project)
                <form method="POST" action="{{ route('projects.destroy', $project) }}" x-data="confirmable({ title: 'Delete project', message: 'This deletes {{ addslashes($project->name) }} and every task inside it. This cannot be undone.', confirm: 'Delete project' })" x-on:submit.prevent="ask($event)">
                    @csrf @method('DELETE')
                    <button class="btn-ghost text-red-600 hover:bg-red-50" type="submit" aria-label="Delete project"><x-icon name="trash" class="h-4 w-4" /></button>
                </form>
            @endcan
        </x-slot:actions>
    </x-page-header>

    {{-- Health & progress summary --}}
    <section class="card mb-6">
        <div class="grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            <div class="flex items-center gap-5">
                <x-progress-ring :value="$project->progress" :size="112" :color="$project->health->color()" sublabel="complete" />
                <div class="min-w-0">
                    <p class="eyebrow">Health</p>
                    <p class="mt-1 text-lg font-semibold tracking-tight text-slate-900">{{ $project->health->label() }}</p>
                    <ul class="mt-1.5 space-y-1">
                        @foreach ($evaluation['reasons'] as $reason)
                            <li class="flex items-start gap-1.5 text-sm text-slate-500">
                                <x-icon name="info" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                <span>{{ $reason }}</span>
                            </li>
                        @endforeach
                    </ul>
                </div>
            </div>

            <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                @foreach ([['Total', $counts['total'], 'slate'], ['In progress', $counts['in_progress'], 'blue'], ['Completed', $counts['completed'], 'emerald'], ['Delayed', $counts['delayed'], 'red'], ['Due soon', $dueSoon, 'amber']] as [$label, $value, $color])
                    <div class="flex flex-col justify-between rounded-xl border border-slate-200/80 p-3.5">
                        <dt class="text-xs font-medium text-slate-500">{{ $label }}</dt>
                        <dd @class(['mt-1 text-2xl font-semibold tracking-tight tabular-nums', 'text-'.$color.'-600' => $value > 0 && $color !== 'slate', 'text-slate-900' => $value === 0 || $color === 'slate'])>{{ $value }}</dd>
                    </div>
                @endforeach
            </dl>
        </div>
    </section>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section class="card self-start">
            <div class="card-header">
                <div>
                    <h2 class="card-title">Tasks</h2>
                    <p class="mt-0.5 text-xs text-slate-500">{{ $counts['total'] }} including subtasks</p>
                </div>
                @can('createTask', $project)
                    <a class="btn-secondary btn-sm" href="{{ route('tasks.create', ['project_id' => $project->id]) }}"><x-icon name="plus" class="h-3.5 w-3.5" stroke="2" /> Add task</a>
                @endcan
            </div>
            <div class="divide-y divide-slate-100">
                @forelse ($project->tasks as $task)
                    <div>
                        <x-task-row :task="$task" :show-project="false" />
                        @if ($task->subtasks->isNotEmpty())
                            <div class="ml-6 border-l-2 border-slate-100 sm:ml-9">
                                @foreach ($task->subtasks as $subtask)
                                    <div class="border-t border-slate-50">
                                        <x-task-row :task="$subtask" :show-project="false" :show-remark="false" />
                                    </div>
                                @endforeach
                            </div>
                        @endif
                    </div>
                @empty
                    <x-empty-state icon="tasks" title="No tasks yet" description="Add the first task to start tracking progress.">
                        @can('createTask', $project)
                            <a href="{{ route('tasks.create', ['project_id' => $project->id]) }}" class="btn-primary btn-sm">Add task</a>
                        @endcan
                    </x-empty-state>
                @endforelse
            </div>
        </section>

        <aside class="space-y-6">
            <section class="card self-start" id="members">
                <div class="card-header">
                    <h2 class="card-title">Team</h2>
                    <span class="text-xs text-slate-500">{{ $project->members->count() }}</span>
                </div>
                <div class="divide-y divide-slate-100">
                    @foreach ($project->members as $member)
                        <div class="flex items-center gap-3 px-5 py-3">
                            <x-avatar :user="$member" size="sm" />
                            <div class="min-w-0 flex-1">
                                <p class="truncate text-sm font-medium text-slate-800">{{ $member->name }}</p>
                                <p class="truncate text-xs text-slate-500">{{ $member->job_title ?: '@'.$member->username }}</p>
                                @if ($member->department)
                                    <x-department-badge :department="$member->department" size="sm" class="mt-1" />
                                @endif
                            </div>
                            @if ($project->owner_id === $member->id)
                                <span class="chip bg-indigo-50 text-indigo-700">Owner</span>
                            @elseif ($member->pivot->role === 'manager')
                                <span class="chip bg-slate-100 text-slate-600">Manager</span>
                            @endif
                        </div>
                    @endforeach
                </div>
                @if ($candidates->isNotEmpty())
                    <div class="border-t border-slate-100 p-3">
                        <form method="POST" action="{{ route('projects.members.store', $project) }}" class="flex gap-2">
                            @csrf
                            <select name="user_id" class="form-select text-sm" required aria-label="Add a team member">
                                <option value="">Add someone…</option>
                                @foreach ($candidates as $candidate)
                                    <option value="{{ $candidate->id }}">{{ $candidate->name }}</option>
                                @endforeach
                            </select>
                            <button class="btn-secondary btn-sm shrink-0" type="submit">Add</button>
                        </form>
                    </div>
                @endif
            </section>

            <section class="card self-start">
                <div class="card-header"><h2 class="card-title">Details</h2></div>
                <dl class="divide-y divide-slate-100 text-sm">
                    @foreach ([['Status', $project->status->label()], ['Priority', $project->priority->label()], ['Start date', $project->start_date?->format('M j, Y') ?? '—'], ['Due date', $project->due_date?->format('M j, Y') ?? '—'], ['Created by', $project->creator?->name ?? '—']] as [$label, $value])
                        <div class="flex items-center justify-between gap-3 px-5 py-2.5">
                            <dt class="text-slate-500">{{ $label }}</dt>
                            <dd class="truncate font-medium text-slate-800">{{ $value }}</dd>
                        </div>
                    @endforeach
                </dl>
            </section>
        </aside>
    </div>
</x-layouts.app>

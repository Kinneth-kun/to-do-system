@php
    $statusCounts = \App\Models\Task::query()->toBase()->selectRaw('status, count(*) as c')->groupBy('status')->pluck('c', 'status');
    $taskTotal = max(1, (int) $statusCounts->sum());
    $healthCounts = \App\Models\Project::query()->toBase()->selectRaw('health, count(*) as c')->groupBy('health')->pluck('c', 'health');
    $healthTotal = max(1, (int) $healthCounts->sum());
    $overall = (int) round((float) \App\Models\Project::query()->active()->avg('progress'));
@endphp
<x-layouts.app title="Executive Dashboard">
    <x-page-header title="Executive Dashboard"
                   :description="\App\Services\Settings::string('general.organization').' · '.now()->format('l, F j, Y')">
        <x-slot:actions>
            <a href="{{ route('admin.meeting') }}" class="btn-primary"><x-icon name="presentation" class="h-4 w-4" /> Meeting mode</a>
        </x-slot:actions>
    </x-page-header>

    {{-- KPI row --}}
    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <x-stat-card label="Active projects" :value="$stats['projects']" icon="folder" color="indigo" :href="route('projects.index', ['status' => 'active'])" />
        <x-stat-card label="Total tasks" :value="$stats['tasks']" icon="tasks" color="violet" :href="route('tasks.index')" />
        <x-stat-card label="Completed" :value="$stats['completed']" icon="check-circle" color="emerald" :href="route('tasks.index', ['status' => 'completed'])" />
        <x-stat-card label="Delayed" :value="$stats['delayed']" icon="alert" color="red" :href="route('tasks.index', ['status' => 'delayed'])" />
        <x-stat-card label="Active people" :value="$stats['users']" icon="users" color="sky" :href="route('admin.users.index')" />
    </div>

    <div class="mb-6 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {{-- Portfolio health --}}
        <section class="card">
            <div class="card-header"><h2 class="card-title">Portfolio health</h2></div>
            <div class="card-body">
                <div class="flex items-center gap-5">
                    <x-progress-ring :value="$overall" :size="104" sublabel="avg progress" />
                    <ul class="min-w-0 flex-1 space-y-2">
                        @foreach (\App\Enums\ProjectHealth::cases() as $health)
                            @php $count = (int) ($healthCounts[$health->value] ?? 0); @endphp
                            <li class="flex items-center gap-2 text-sm">
                                <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-{{ $health->color() }}-500"></span>
                                <span class="min-w-0 flex-1 truncate text-slate-600">{{ $health->label() }}</span>
                                <span class="font-semibold text-slate-900 tabular-nums">{{ $count }}</span>
                            </li>
                        @endforeach
                    </ul>
                </div>
            </div>
        </section>

        {{-- Task distribution --}}
        <section class="card">
            <div class="card-header">
                <h2 class="card-title">Task distribution</h2>
                <span class="text-xs text-slate-500">{{ $statusCounts->sum() }} tasks</span>
            </div>
            <div class="card-body">
                <div class="flex h-3 overflow-hidden rounded-full bg-slate-100">
                    @foreach (\App\Enums\TaskStatus::cases() as $status)
                        @php $count = (int) ($statusCounts[$status->value] ?? 0); @endphp
                        @if ($count > 0)
                            <div class="bg-{{ $status->color() }}-500 transition-all"
                                 style="width: {{ round($count / $taskTotal * 100, 1) }}%"
                                 title="{{ $status->label() }}: {{ $count }}"></div>
                        @endif
                    @endforeach
                </div>
                <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                    @foreach (\App\Enums\TaskStatus::cases() as $status)
                        @php $count = (int) ($statusCounts[$status->value] ?? 0); @endphp
                        <div class="flex items-center gap-2 text-sm">
                            <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-{{ $status->color() }}-500"></span>
                            <span class="min-w-0 flex-1 truncate text-slate-600">{{ $status->label() }}</span>
                            <span class="font-semibold text-slate-900 tabular-nums">{{ $count }}</span>
                        </div>
                    @endforeach
                </div>
            </div>
        </section>
    </div>

    {{-- Work by department: who owns what, and where the delays sit --}}
    @php
        $byDepartment = \App\Models\User::query()
            ->whereNotNull('department')
            ->withCount([
                'assignedTasks as open_tasks' => fn ($q) => $q->whereIn('status', \App\Enums\TaskStatus::openValues()),
                'assignedTasks as delayed_tasks' => fn ($q) => $q->where('status', \App\Enums\TaskStatus::Delayed->value),
                'assignedTasks as completed_tasks' => fn ($q) => $q->where('status', \App\Enums\TaskStatus::Completed->value),
            ])
            ->get()
            ->groupBy(fn ($user) => $user->department->value)
            ->map(fn ($users) => [
                'people' => $users->count(),
                'open' => $users->sum('open_tasks'),
                'delayed' => $users->sum('delayed_tasks'),
                'completed' => $users->sum('completed_tasks'),
            ]);
        $maxOpen = max(1, $byDepartment->max('open') ?? 1);
    @endphp
    <section class="card mb-6">
        <div class="card-header">
            <div>
                <h2 class="card-title">Work by department</h2>
                <p class="mt-0.5 text-xs text-slate-500">Open tasks counted against the department of the person assigned.</p>
            </div>
        </div>
        <div class="divide-y divide-slate-100">
            @foreach (\App\Enums\Department::cases() as $department)
                @php $row = $byDepartment[$department->value] ?? ['people' => 0, 'open' => 0, 'delayed' => 0, 'completed' => 0]; @endphp
                <a href="{{ route('tasks.index', ['department' => $department->value]) }}"
                   class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition hover:bg-slate-50">
                    <span class="w-full sm:w-52"><x-department-badge :department="$department" /></span>
                    <span class="hidden w-20 text-xs text-slate-500 sm:inline">{{ $row['people'] }} {{ Str::plural('person', $row['people']) }}</span>
                    <span class="min-w-0 flex-1">
                        <span class="flex h-2 overflow-hidden rounded-full bg-slate-100">
                            <span class="bg-{{ $department->color() }}-500" style="width: {{ round($row['open'] / $maxOpen * 100) }}%"></span>
                        </span>
                    </span>
                    <span class="flex items-center gap-4 text-xs tabular-nums">
                        <span class="text-slate-600"><span class="font-semibold text-slate-900">{{ $row['open'] }}</span> open</span>
                        <span @class(['font-semibold text-red-600' => $row['delayed'] > 0, 'text-slate-400' => $row['delayed'] === 0])>{{ $row['delayed'] }} delayed</span>
                        <span class="hidden text-slate-500 sm:inline">{{ $row['completed'] }} done</span>
                    </span>
                </a>
            @endforeach
        </div>
    </section>

    {{-- Portfolio table --}}
    <section class="card overflow-hidden">
        <div class="card-header">
            <h2 class="card-title">Project portfolio</h2>
            <a class="link text-sm" href="{{ route('projects.index') }}">All projects</a>
        </div>

        @if ($projects->isEmpty())
            <x-empty-state icon="folder" title="No projects yet" description="Delivery health will appear here once projects exist." />
        @else
            {{-- Desktop table --}}
            <div class="hidden overflow-x-auto md:block">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Health</th>
                            <th class="w-48">Progress</th>
                            <th>Owner</th>
                            <th>Due</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($projects->sortBy(fn ($p) => $p->health->urgency()) as $project)
                            <tr class="cursor-pointer" onclick="window.location='{{ route('projects.show', $project) }}'">
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <span class="h-2.5 w-2.5 shrink-0 rounded-sm bg-{{ $project->color }}-500"></span>
                                        <span class="font-medium text-slate-900">{{ $project->name }}</span>
                                    </div>
                                </td>
                                <td><x-health-badge :health="$project->health" size="sm" /></td>
                                <td>
                                    <div class="flex items-center gap-2">
                                        <x-progress-bar :value="$project->progress" size="sm" class="w-28" />
                                        <span class="text-xs font-medium text-slate-600 tabular-nums">{{ $project->progress }}%</span>
                                    </div>
                                </td>
                                <td>
                                    <span class="inline-flex items-center gap-2">
                                        <x-avatar :user="$project->owner" size="xs" />
                                        <span class="text-sm text-slate-600">{{ $project->owner?->name }}</span>
                                    </span>
                                </td>
                                <td>
                                    @if ($project->due_date)
                                        <span @class(['text-sm whitespace-nowrap', 'font-semibold text-red-600' => $project->isOverdue(), 'text-slate-600' => ! $project->isOverdue()])>
                                            {{ $project->due_date->format('M j, Y') }}
                                        </span>
                                    @else
                                        <span class="text-sm text-slate-400">—</span>
                                    @endif
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            {{-- Mobile cards --}}
            <div class="divide-y divide-slate-100 md:hidden">
                @foreach ($projects->sortBy(fn ($p) => $p->health->urgency()) as $project)
                    <a href="{{ route('projects.show', $project) }}" class="block px-4 py-3">
                        <div class="flex items-center gap-2">
                            <span class="h-2.5 w-2.5 shrink-0 rounded-sm bg-{{ $project->color }}-500"></span>
                            <span class="min-w-0 flex-1 truncate font-medium text-slate-900">{{ $project->name }}</span>
                            <x-health-badge :health="$project->health" size="sm" />
                        </div>
                        <div class="mt-2 flex items-center gap-3">
                            <x-progress-bar :value="$project->progress" size="sm" class="flex-1" />
                            <span class="text-xs text-slate-500 tabular-nums">{{ $project->progress }}%</span>
                        </div>
                    </a>
                @endforeach
            </div>
        @endif
    </section>
</x-layouts.app>

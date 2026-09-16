@php
    $user = auth()->user();
    $hour = (int) now()->format('G');
    $greeting = $hour < 12 ? 'Good morning' : ($hour < 18 ? 'Good afternoon' : 'Good evening');
    $total = $counts['open'] + $counts['completed'];
    $completion = $total > 0 ? (int) round($counts['completed'] / $total * 100) : 0;
@endphp
<x-layouts.app title="Dashboard">
    <x-page-header :title="$greeting.', '.$user->firstName()" description="Here is the work that needs your attention today.">
        <x-slot:actions>
            <a class="btn-primary" href="{{ route('tasks.create') }}"><x-icon name="plus" class="h-4 w-4" stroke="2" /> New task</a>
        </x-slot:actions>
    </x-page-header>

    {{-- Overview: completion ring + the four counts that matter --}}
    <section class="card mb-6 overflow-hidden">
        <div class="grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            <div class="flex items-center gap-5">
                <x-progress-ring :value="$completion" :size="120" sublabel="completed" />
                <div class="min-w-0">
                    <p class="eyebrow">Your workload</p>
                    <p class="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                        {{ $counts['open'] }} open {{ Str::plural('task', $counts['open']) }}
                    </p>
                    <p class="mt-1 text-sm text-slate-500">
                        @if ($counts['delayed'] > 0)
                            {{ $counts['delayed'] }} delayed {{ Str::plural('item', $counts['delayed']) }} need attention.
                        @elseif ($counts['due_soon'] > 0)
                            {{ $counts['due_soon'] }} due in the next few days.
                        @else
                            Nothing overdue — you're on track.
                        @endif
                    </p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                @foreach ([
                    ['label' => 'Open work', 'value' => $counts['open'], 'icon' => 'tasks', 'color' => 'indigo', 'href' => route('tasks.index', ['status' => 'in_progress'])],
                    ['label' => 'Due soon', 'value' => $counts['due_soon'], 'icon' => 'clock', 'color' => 'amber', 'href' => route('calendar')],
                    ['label' => 'Delayed', 'value' => $counts['delayed'], 'icon' => 'alert', 'color' => 'red', 'href' => route('tasks.index', ['status' => 'delayed'])],
                    ['label' => 'Completed', 'value' => $counts['completed'], 'icon' => 'check-circle', 'color' => 'emerald', 'href' => route('tasks.index', ['status' => 'completed'])],
                ] as $tile)
                    <a href="{{ $tile['href'] }}"
                       class="group rounded-xl border border-slate-200/80 p-3.5 transition hover:border-{{ $tile['color'] }}-200 hover:bg-{{ $tile['color'] }}-50/40">
                        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-{{ $tile['color'] }}-50 text-{{ $tile['color'] }}-600">
                            <x-icon :name="$tile['icon']" class="h-4 w-4" />
                        </span>
                        <span class="mt-3 block text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{{ $tile['value'] }}</span>
                        <span class="mt-0.5 block text-xs font-medium text-slate-500">{{ $tile['label'] }}</span>
                    </a>
                @endforeach
            </div>
        </div>
    </section>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section class="card self-start">
            <div class="card-header">
                <div>
                    <h2 class="card-title">Next up</h2>
                    <p class="mt-0.5 text-xs text-slate-500">Sorted by due date — update without leaving this page.</p>
                </div>
                <a class="link text-sm" href="{{ route('tasks.index') }}">View all</a>
            </div>
            <div class="divide-y divide-slate-100">
                @forelse ($tasks as $task)
                    <x-task-row :task="$task" />
                @empty
                    <x-empty-state icon="check-circle" title="You're all caught up" description="No open tasks are waiting on you right now.">
                        <a href="{{ route('tasks.create') }}" class="btn-secondary btn-sm">Create a task</a>
                    </x-empty-state>
                @endforelse
            </div>
        </section>

        <section class="card self-start">
            <div class="card-header">
                <h2 class="card-title">Projects</h2>
                <a class="link text-sm" href="{{ route('projects.index') }}">View all</a>
            </div>
            <div class="divide-y divide-slate-100">
                @forelse ($projects as $project)
                    <a class="block px-5 py-3.5 transition hover:bg-slate-50" href="{{ route('projects.show', $project) }}">
                        <div class="flex items-center gap-2">
                            <span class="h-2 w-2 shrink-0 rounded-sm bg-{{ $project->color }}-500"></span>
                            <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{{ $project->name }}</span>
                            <x-health-badge :health="$project->health" size="sm" />
                        </div>
                        <div class="mt-2.5 flex items-center gap-3">
                            <x-progress-bar :value="$project->progress" size="xs" class="flex-1" />
                            <span class="w-9 text-right text-xs font-medium text-slate-500 tabular-nums">{{ $project->progress }}%</span>
                        </div>
                    </a>
                @empty
                    <x-empty-state icon="folder" title="No projects yet" description="Projects group related tasks together.">
                        <a href="{{ route('projects.create') }}" class="btn-secondary btn-sm">Create a project</a>
                    </x-empty-state>
                @endforelse
            </div>
        </section>
    </div>
</x-layouts.app>

@php
    $step = $view === 'month' ? 'month' : ($view === 'week' ? 'week' : 'day');
    $prev = $date->copy()->{'sub'.ucfirst($step)}()->toDateString();
    $next = $date->copy()->{'add'.ucfirst($step)}()->toDateString();
    $base = array_filter(['view' => $view, 'project_id' => $data['project_id'] ?? null, 'scope' => $data['scope'] ?? null]);
    $heading = match ($view) {
        'day' => $date->format('l, F j, Y'),
        'week' => $from->format('M j').' – '.$to->format($from->isSameMonth($to) ? 'j, Y' : 'M j, Y'),
        default => $date->format('F Y'),
    };
@endphp
<x-layouts.app title="Calendar" :full-width="true">
    <x-page-header title="Calendar" description="Scheduling and deadlines, driven by task dates.">
        <x-slot:actions>
            <a href="{{ route('tasks.create', ['due_date' => $date->toDateString()]) }}" class="btn-primary"><x-icon name="plus" class="h-4 w-4" stroke="2" /> New task</a>
        </x-slot:actions>
    </x-page-header>

    {{-- Toolbar --}}
    <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-center gap-2">
            <div class="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
                <a class="btn-icon h-8 w-8 rounded-r-none" href="{{ route('calendar', array_merge($base, ['date' => $prev])) }}" aria-label="Previous {{ $step }}">
                    <x-icon name="chevron-left" class="h-4 w-4" />
                </a>
                <span class="h-5 w-px bg-slate-200"></span>
                <a class="btn-icon h-8 w-8 rounded-l-none" href="{{ route('calendar', array_merge($base, ['date' => $next])) }}" aria-label="Next {{ $step }}">
                    <x-icon name="chevron-right" class="h-4 w-4" />
                </a>
            </div>
            <a class="btn-secondary btn-sm" href="{{ route('calendar', array_merge($base, ['date' => today()->toDateString()])) }}">Today</a>
            <h2 class="ml-1 text-lg font-semibold tracking-tight text-slate-900">{{ $heading }}</h2>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                @foreach (['month' => 'Month', 'week' => 'Week', 'day' => 'Day'] as $value => $label)
                    <a href="{{ route('calendar', array_merge($base, ['view' => $value, 'date' => $date->toDateString()])) }}"
                       @class([
                           'rounded-md px-3 py-1.5 text-xs font-medium transition',
                           'bg-slate-900 text-white' => $view === $value,
                           'text-slate-600 hover:bg-slate-50' => $view !== $value,
                       ])>{{ $label }}</a>
                @endforeach
            </div>
            <form method="GET" class="flex flex-wrap items-center gap-2">
                <input type="hidden" name="view" value="{{ $view }}">
                <input type="hidden" name="date" value="{{ $date->toDateString() }}">
                <select name="project_id" class="form-select py-1.5 text-xs sm:w-44" onchange="this.form.submit()" aria-label="Filter by project">
                    <option value="">All projects</option>
                    @foreach ($projects as $project)
                        <option value="{{ $project->id }}" @selected((string) ($data['project_id'] ?? '') === (string) $project->id)>{{ $project->name }}</option>
                    @endforeach
                </select>
                <select name="scope" class="form-select py-1.5 text-xs sm:w-32" onchange="this.form.submit()" aria-label="Filter by scope">
                    <option value="all" @selected(($data['scope'] ?? 'all') === 'all')>Everyone</option>
                    <option value="mine" @selected(($data['scope'] ?? '') === 'mine')>My work</option>
                </select>
            </form>
        </div>
    </div>

    @if ($view === 'month')
        {{-- Month grid: weekday headers + 7-column grid, agenda list on phones --}}
        <div class="card hidden overflow-hidden md:block">
            <div class="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
                @foreach (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as $weekday)
                    <div class="px-3 py-2 text-center text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{{ $weekday }}</div>
                @endforeach
            </div>
            <div class="grid grid-cols-7">
                @foreach ($days as $day)
                    @php
                        $isToday = $day['date']->isToday();
                        $outside = $day['date']->month !== $date->month;
                    @endphp
                    <div @class([
                        'group relative min-h-28 border-r border-b border-slate-100 p-2 transition last:border-r-0',
                        'bg-slate-50/60' => $outside,
                        'bg-indigo-50/30' => $isToday,
                    ])>
                        <div class="flex items-center justify-between">
                            <span @class([
                                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                                'bg-indigo-600 font-semibold text-white' => $isToday,
                                'text-slate-400' => $outside && ! $isToday,
                                'text-slate-600' => ! $outside && ! $isToday,
                            ])>{{ $day['date']->day }}</span>
                            <a href="{{ route('tasks.create', ['due_date' => $day['date']->toDateString()]) }}"
                               class="rounded p-0.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-white hover:text-indigo-600 focus:opacity-100"
                               aria-label="Add a task due {{ $day['date']->format('M j') }}">
                                <x-icon name="plus" class="h-3.5 w-3.5" stroke="2" />
                            </a>
                        </div>
                        <div class="mt-1.5 space-y-1">
                            @foreach ($day['tasks']->take(3) as $task)
                                <a href="{{ route('tasks.show', $task) }}"
                                   class="block truncate rounded border-l-2 border-{{ $task->status->color() }}-500 bg-{{ $task->status->color() }}-50/70 px-1.5 py-1 text-[11px] leading-tight font-medium text-slate-700 transition hover:bg-{{ $task->status->color() }}-100"
                                   title="{{ $task->title }} · {{ $task->status->label() }}">
                                    <span class="{{ $task->status === \App\Enums\TaskStatus::Completed ? 'line-through decoration-slate-400' : '' }}">{{ $task->title }}</span>
                                </a>
                            @endforeach
                            @if ($day['tasks']->count() > 3)
                                <a href="{{ route('calendar', array_merge($base, ['view' => 'day', 'date' => $day['date']->toDateString()])) }}"
                                   class="block px-1.5 text-[11px] font-medium text-slate-500 hover:text-indigo-600">
                                    +{{ $day['tasks']->count() - 3 }} more
                                </a>
                            @endif
                        </div>
                    </div>
                @endforeach
            </div>
        </div>

        {{-- Phone agenda --}}
        <div class="card divide-y divide-slate-100 md:hidden">
            @forelse ($days->filter(fn ($day) => $day['tasks']->isNotEmpty()) as $day)
                <div class="px-4 py-3">
                    <p @class(['text-xs font-semibold', 'text-indigo-600' => $day['date']->isToday(), 'text-slate-500' => ! $day['date']->isToday()])>
                        {{ $day['date']->isToday() ? 'Today · ' : '' }}{{ $day['date']->format('D, M j') }}
                    </p>
                    <div class="mt-2 space-y-1.5">
                        @foreach ($day['tasks'] as $task)
                            <a href="{{ route('tasks.show', $task) }}" class="flex items-center gap-2 rounded-lg border border-slate-100 p-2">
                                <span class="h-2 w-2 shrink-0 rounded-full bg-{{ $task->status->color() }}-500"></span>
                                <span class="min-w-0 flex-1 truncate text-sm text-slate-700">{{ $task->title }}</span>
                                <span class="shrink-0 text-xs text-slate-400">{{ $task->progress }}%</span>
                            </a>
                        @endforeach
                    </div>
                </div>
            @empty
                <x-empty-state icon="calendar" title="Nothing scheduled" description="No tasks fall in this month." />
            @endforelse
        </div>
    @else
        {{-- Week & day: column / list layout --}}
        <div @class(['grid gap-4', 'sm:grid-cols-2 xl:grid-cols-7' => $view === 'week'])>
            @foreach ($days as $day)
                <section @class(['card overflow-hidden', 'ring-2 ring-indigo-500/60' => $day['date']->isToday()])>
                    <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                        <h3 @class(['text-sm font-semibold', 'text-indigo-600' => $day['date']->isToday(), 'text-slate-700' => ! $day['date']->isToday()])>
                            {{ $view === 'week' ? $day['date']->format('D j') : $day['date']->format('l, F j') }}
                        </h3>
                        <span class="text-xs text-slate-400 tabular-nums">{{ $day['tasks']->count() }}</span>
                    </div>
                    @if ($view === 'day')
                        <div class="divide-y divide-slate-100">
                            @forelse ($day['tasks'] as $task)
                                <x-task-row :task="$task" />
                            @empty
                                <x-empty-state icon="calendar" title="Nothing due" description="No tasks are scheduled for this day.">
                                    <a href="{{ route('tasks.create', ['due_date' => $day['date']->toDateString()]) }}" class="btn-secondary btn-sm">Add a task</a>
                                </x-empty-state>
                            @endforelse
                        </div>
                    @else
                        <div class="space-y-2 p-3">
                            @forelse ($day['tasks'] as $task)
                                <a href="{{ route('tasks.show', $task) }}"
                                   class="block rounded-lg border-l-2 border-{{ $task->status->color() }}-500 bg-slate-50 p-2 transition hover:bg-slate-100">
                                    <p class="line-clamp-2 text-xs font-medium text-slate-700">{{ $task->title }}</p>
                                    <p class="mt-1 truncate text-[11px] text-slate-500">{{ $task->project?->name }}</p>
                                    <div class="mt-1.5 flex items-center gap-1.5">
                                        <x-progress-bar :value="$task->progress" size="xs" class="flex-1" />
                                        <x-avatar :user="$task->assignee" size="xs" />
                                    </div>
                                </a>
                            @empty
                                <p class="px-1 py-3 text-center text-xs text-slate-400">—</p>
                            @endforelse
                        </div>
                    @endif
                </section>
            @endforeach
        </div>
    @endif

    {{-- Legend --}}
    <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span class="eyebrow">Status</span>
        @foreach (\App\Enums\TaskStatus::cases() as $status)
            <span class="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span class="h-2 w-2 rounded-full bg-{{ $status->color() }}-500"></span>{{ $status->label() }}
            </span>
        @endforeach
    </div>
</x-layouts.app>

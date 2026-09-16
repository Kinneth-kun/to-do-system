@php
    $active = array_filter([
        'q' => $filters['q'] ?? null,
        'status' => $filters['status'] ?? null,
        'project_id' => $filters['project_id'] ?? null,
        'mine' => ! empty($filters['mine']) ? 1 : null,
        'department' => $filters['department'] ?? null,
    ]);
@endphp
<x-layouts.app title="My Tasks">
    <x-page-header title="My tasks" description="Track work across your visible projects.">
        <x-slot:actions>
            <a href="{{ route('tasks.create') }}" class="btn-primary"><x-icon name="plus" class="h-4 w-4" stroke="2" /> New task</a>
        </x-slot:actions>
    </x-page-header>

    {{-- Status filter row --}}
    <div class="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div class="flex min-w-max items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            @foreach (['' => 'All statuses'] + \App\Enums\TaskStatus::options() as $value => $label)
                @php $on = (string) ($filters['status'] ?? '') === (string) $value; @endphp
                <a href="{{ route('tasks.index', array_merge($active, ['status' => $value ?: null])) }}"
                   @class([
                       'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition',
                       'bg-slate-900 text-white' => $on,
                       'text-slate-600 hover:bg-slate-50 hover:text-slate-900' => ! $on,
                   ])>
                    @if ($value)
                        <span class="h-1.5 w-1.5 rounded-full bg-{{ \App\Enums\TaskStatus::from($value)->color() }}-500"></span>
                    @endif
                    {{ $label }}
                </a>
            @endforeach
        </div>
    </div>

    <form method="GET" class="toolbar mb-6">
        <input type="hidden" name="status" value="{{ $filters['status'] ?? '' }}">
        <div class="relative min-w-0 flex-1 sm:max-w-xs">
            <x-icon name="search" class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input class="form-input pl-9" name="q" value="{{ $filters['q'] ?? '' }}" placeholder="Search tasks" aria-label="Search tasks">
        </div>
        <select class="form-select sm:w-56" name="department" aria-label="Filter by department" onchange="this.form.submit()">
            <option value="">All departments</option>
            @foreach (\App\Enums\Department::options() as $value => $label)
                <option value="{{ $value }}" @selected(($filters['department'] ?? '') === $value)>{{ $label }}</option>
            @endforeach
        </select>
        <select class="form-select sm:w-52" name="project_id" aria-label="Filter by project">
            <option value="">All projects</option>
            @foreach ($projects as $project)
                <option value="{{ $project->id }}" @selected((string) ($filters['project_id'] ?? '') === (string) $project->id)>{{ $project->name }}</option>
            @endforeach
        </select>
        <label class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
            <input type="checkbox" name="mine" value="1" class="form-checkbox" @checked(! empty($filters['mine'])) onchange="this.form.submit()">
            Only mine
        </label>
        <button class="btn-secondary" type="submit">Apply</button>
        @if ($active)
            <a href="{{ route('tasks.index') }}" class="btn-ghost btn-sm">Clear</a>
        @endif
    </form>

    <div class="card divide-y divide-slate-100">
        @forelse ($tasks as $task)
            <x-task-row :task="$task" />
        @empty
            <x-empty-state icon="tasks" title="No matching tasks"
                           description="{{ $active ? 'Try clearing a filter or searching for something else.' : 'Create your first task to get started.' }}">
                <a href="{{ route('tasks.create') }}" class="btn-primary btn-sm">New task</a>
            </x-empty-state>
        @endforelse
    </div>

    @if ($tasks->hasPages())
        <div class="mt-6">{{ $tasks->links() }}</div>
    @endif
</x-layouts.app>

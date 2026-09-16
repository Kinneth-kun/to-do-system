<x-layouts.app title="Projects">
    <x-page-header title="Projects" description="Workspaces you own or collaborate on.">
        <x-slot:actions>
            <a href="{{ route('projects.create') }}" class="btn-primary"><x-icon name="plus" class="h-4 w-4" stroke="2" /> New project</a>
        </x-slot:actions>
    </x-page-header>

    <form method="GET" class="toolbar mb-6">
        <div class="relative min-w-0 flex-1 sm:max-w-xs">
            <x-icon name="search" class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input class="form-input pl-9" name="q" value="{{ $filters['q'] ?? '' }}" placeholder="Search projects" aria-label="Search projects">
        </div>
        <div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            @foreach (['' => 'All'] + \App\Enums\ProjectStatus::options() as $value => $label)
                @php $active = (string) ($filters['status'] ?? '') === (string) $value; @endphp
                <a href="{{ route('projects.index', array_filter(['q' => $filters['q'] ?? null, 'status' => $value ?: null])) }}"
                   @class([
                       'rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition',
                       'bg-indigo-50 text-indigo-700' => $active,
                       'text-slate-600 hover:bg-slate-50 hover:text-slate-900' => ! $active,
                   ])>{{ $label }}</a>
            @endforeach
        </div>
        <button class="btn-secondary sm:ml-auto" type="submit">Search</button>
    </form>

    @if ($projects->isEmpty())
        <div class="card">
            <x-empty-state icon="folder" title="No projects found"
                           description="{{ ($filters['q'] ?? null) ? 'No projects match your search. Try different keywords.' : 'Create a project to give your work a home.' }}">
                <a href="{{ route('projects.create') }}" class="btn-primary">Create project</a>
            </x-empty-state>
        </div>
    @else
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            @foreach ($projects as $project)
                <a href="{{ route('projects.show', $project) }}" class="card card-hover group relative block overflow-hidden">
                    <span class="absolute inset-x-0 top-0 h-1 bg-{{ $project->color }}-500"></span>
                    <div class="p-5 pt-6">
                        <div class="flex items-start justify-between gap-3">
                            <h2 class="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-slate-900 group-hover:text-indigo-600">{{ $project->name }}</h2>
                            <x-health-badge :health="$project->health" size="sm" />
                        </div>
                        <p class="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-slate-500">{{ $project->description ?: 'No description yet.' }}</p>

                        <div class="mt-5 flex items-center gap-3">
                            <x-progress-bar :value="$project->progress" size="sm" class="flex-1" />
                            <span class="text-xs font-semibold text-slate-600 tabular-nums">{{ $project->progress }}%</span>
                        </div>

                        <div class="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                            <div class="flex items-center gap-2">
                                <x-avatar-stack :users="$project->members" :max="3" />
                                <span class="text-xs text-slate-500">{{ $project->all_tasks_count }} {{ Str::plural('task', $project->all_tasks_count) }}</span>
                            </div>
                            @if ($project->due_date)
                                <span @class([
                                    'inline-flex items-center gap-1 text-xs whitespace-nowrap',
                                    'font-semibold text-red-600' => $project->isOverdue(),
                                    'text-slate-500' => ! $project->isOverdue(),
                                ])>
                                    <x-icon :name="$project->isOverdue() ? 'alert' : 'calendar'" class="h-3.5 w-3.5" />
                                    {{ $project->due_date->format('M j') }}
                                </span>
                            @else
                                <x-project-status-badge :status="$project->status" />
                            @endif
                        </div>
                    </div>
                </a>
            @endforeach
        </div>
        <div class="mt-6">{{ $projects->links() }}</div>
    @endif
</x-layouts.app>

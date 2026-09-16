<x-layouts.app title="Projects">
    <x-page-header title="Projects" description="Workspaces you own or collaborate on.">
        <x-slot:actions><a href="{{ route('projects.create') }}" class="btn-primary"><x-icon name="plus" class="h-4 w-4" /> New project</a></x-slot:actions>
    </x-page-header>
    <form method="GET" class="mb-5 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <input class="form-input" name="q" value="{{ $filters['q'] ?? '' }}" placeholder="Search projects" aria-label="Search projects">
        <select class="form-select" name="status" aria-label="Filter by status"><option value="">All statuses</option>@foreach(\App\Enums\ProjectStatus::options() as $value => $label)<option value="{{ $value }}" @selected(($filters['status'] ?? '') === $value)>{{ $label }}</option>@endforeach</select>
        <button class="btn-secondary" type="submit">Filter</button>
    </form>
    @if($projects->isEmpty())
        <x-empty-state icon="folder" title="No projects found" description="Create a project to give your work a home."><a href="{{ route('projects.create') }}" class="btn-primary">Create project</a></x-empty-state>
    @else
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @foreach($projects as $project)
                <a href="{{ route('projects.show', $project) }}" class="card block transition hover:-translate-y-0.5 hover:shadow-md">
                    <div class="card-body">
                        <div class="flex items-start justify-between gap-3"><span class="h-3 w-3 shrink-0 rounded bg-{{ $project->color }}-500"></span><x-health-badge :health="$project->health" size="sm" /></div>
                        <h2 class="mt-4 truncate text-lg font-semibold text-slate-900">{{ $project->name }}</h2>
                        <p class="mt-1 line-clamp-2 text-sm text-slate-500">{{ $project->description ?: 'No description yet.' }}</p>
                        <div class="mt-5"><x-progress-bar :value="$project->progress" :show-label="true" /></div>
                        <div class="mt-4 flex items-center justify-between text-xs text-slate-500"><x-project-status-badge :status="$project->status" /><span>{{ $project->tasks_count }} tasks</span></div>
                    </div>
                </a>
            @endforeach
        </div>
        <div class="mt-6">{{ $projects->links() }}</div>
    @endif
</x-layouts.app>

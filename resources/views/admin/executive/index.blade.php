<x-layouts.app title="Executive Dashboard">
    <x-page-header title="Executive Dashboard" description="A concise view of delivery health across the organization." />
    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <x-stat-card label="Active users" :value="$stats['users']" icon="users" color="indigo" />
        <x-stat-card label="Active projects" :value="$stats['projects']" icon="folder" color="sky" />
        <x-stat-card label="Tasks" :value="$stats['tasks']" icon="tasks" color="violet" />
        <x-stat-card label="Completed" :value="$stats['completed']" icon="check" color="emerald" />
        <x-stat-card label="Delayed" :value="$stats['delayed']" icon="alert" color="red" />
    </div>
    <section class="card"><div class="card-header"><h2 class="card-title">Recent projects</h2></div><div class="divide-y divide-slate-100">
        @forelse($projects as $project)<a href="{{ route('projects.show', $project) }}" class="flex flex-wrap items-center gap-3 p-4 hover:bg-slate-50"><span class="h-3 w-3 rounded-full bg-{{ $project->color }}-500"></span><span class="min-w-40 flex-1 font-medium text-slate-900">{{ $project->name }}</span><x-health-badge :health="$project->health" /><span class="text-sm text-slate-500">{{ $project->progress }}%</span></a>@empty
            <x-empty-state icon="folder" title="No projects yet" description="Create a project to see delivery health here." />
        @endforelse
    </div></section>
</x-layouts.app>

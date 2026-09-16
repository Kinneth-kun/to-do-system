@php
    $total = $projects->count() + $tasks->count() + $users->count();
@endphp
<x-layouts.app title="Search">
    <x-page-header title="Search" :description="$q ? $total.' '.Str::plural('result', $total).' for “'.$q.'”' : 'Find projects, tasks and people across your workspace.'" />

    <form method="GET" action="{{ route('search') }}" class="mb-6">
        <div class="relative">
            <x-icon name="search" class="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input class="form-input py-3 pr-28 pl-11 text-base" name="q" value="{{ $q }}" placeholder="Search everything…" autofocus required minlength="2">
            <button class="btn-primary absolute top-1/2 right-2 -translate-y-1/2" type="submit">Search</button>
        </div>
    </form>

    @if (! $q)
        <div class="card">
            <x-empty-state icon="search" title="Start typing to search"
                           description="Look for a project name, a task title, a remark, or a teammate's name or @username." />
        </div>
    @elseif ($total === 0)
        <div class="card">
            <x-empty-state icon="search" title="No results for “{{ $q }}”"
                           description="Check the spelling or try a shorter, more general term." />
        </div>
    @else
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section class="card self-start">
                <div class="card-header">
                    <h2 class="card-title">Tasks</h2>
                    <span class="chip bg-slate-100 text-slate-600">{{ $tasks->count() }}</span>
                </div>
                <div class="divide-y divide-slate-100">
                    @forelse ($tasks as $task)
                        <x-task-row :task="$task" />
                    @empty
                        <p class="px-5 py-6 text-center text-sm text-slate-500">No matching tasks.</p>
                    @endforelse
                </div>
            </section>

            <div class="space-y-6">
                <section class="card self-start">
                    <div class="card-header">
                        <h2 class="card-title">Projects</h2>
                        <span class="chip bg-slate-100 text-slate-600">{{ $projects->count() }}</span>
                    </div>
                    <div class="divide-y divide-slate-100">
                        @forelse ($projects as $project)
                            <a class="block px-5 py-3 transition hover:bg-slate-50" href="{{ route('projects.show', $project) }}">
                                <div class="flex items-center gap-2">
                                    <span class="h-2 w-2 shrink-0 rounded-sm bg-{{ $project->color }}-500"></span>
                                    <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{{ $project->name }}</span>
                                    <x-health-badge :health="$project->health" size="sm" />
                                </div>
                                <div class="mt-2 flex items-center gap-2">
                                    <x-progress-bar :value="$project->progress" size="xs" class="flex-1" />
                                    <span class="text-xs text-slate-500 tabular-nums">{{ $project->progress }}%</span>
                                </div>
                            </a>
                        @empty
                            <p class="px-5 py-6 text-center text-sm text-slate-500">No matching projects.</p>
                        @endforelse
                    </div>
                </section>

                <section class="card self-start">
                    <div class="card-header">
                        <h2 class="card-title">People</h2>
                        <span class="chip bg-slate-100 text-slate-600">{{ $users->count() }}</span>
                    </div>
                    <div class="divide-y divide-slate-100">
                        @forelse ($users as $user)
                            <div class="flex items-center gap-3 px-5 py-3">
                                <x-avatar :user="$user" size="sm" />
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-sm font-medium text-slate-800">{{ $user->name }}</p>
                                    <p class="truncate text-xs text-slate-500">{{ $user->job_title ?: '@'.$user->username }}</p>
                                    @if ($user->department)
                                        <x-department-badge :department="$user->department" size="sm" class="mt-1" />
                                    @endif
                                </div>
                                @if (auth()->user()->isAdmin())
                                    <a href="{{ route('admin.users.edit', $user) }}" class="btn-ghost btn-sm">Manage</a>
                                @endif
                            </div>
                        @empty
                            <p class="px-5 py-6 text-center text-sm text-slate-500">No matching people.</p>
                        @endforelse
                    </div>
                </section>
            </div>
        </div>
    @endif
</x-layouts.app>

@php
    $updates = $task->updates()->with('user')->limit(15)->get();
@endphp
<x-layouts.app :title="$task->title">
    <x-page-header :title="$task->title" :back="$task->parent ? route('tasks.show', $task->parent) : route('tasks.index')">
        <x-slot:meta>
            <nav class="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
                @if ($task->project)
                    <a href="{{ route('projects.show', $task->project) }}" class="inline-flex items-center gap-1.5 hover:text-slate-700">
                        <span class="h-2 w-2 rounded-sm bg-{{ $task->project->color }}-500"></span>{{ $task->project->name }}
                    </a>
                @endif
                @if ($task->parent)
                    <x-icon name="chevron-right" class="h-3 w-3 text-slate-300" />
                    <a href="{{ route('tasks.show', $task->parent) }}" class="truncate hover:text-slate-700">{{ $task->parent->title }}</a>
                @endif
            </nav>
            <div class="mt-3 flex flex-wrap items-center gap-2">
                <x-status-badge :status="$task->status" size="lg" />
                <x-priority-badge :priority="$task->priority" />
                <x-due-date :task="$task" format="M j, Y" />
                @if ($task->latest_update_at)
                    <span class="text-xs text-slate-400">Updated {{ $task->latest_update_at->diffForHumans() }}</span>
                @endif
            </div>
        </x-slot:meta>
        <x-slot:actions>
            @can('addSubtask', $task)
                <a class="btn-secondary" href="{{ route('tasks.create', ['parent_id' => $task->id]) }}"><x-icon name="subtask" class="h-4 w-4" /> Add subtask</a>
            @endcan
            @can('edit', $task)
                <a class="btn-secondary" href="{{ route('tasks.edit', $task) }}"><x-icon name="pencil" class="h-4 w-4" /> Edit</a>
            @endcan
            @can('delete', $task)
                <form method="POST" action="{{ route('tasks.destroy', $task) }}" onsubmit="return confirm('Delete this task and its subtasks?')">
                    @csrf @method('DELETE')
                    <button class="btn-ghost text-red-600 hover:bg-red-50" type="submit" aria-label="Delete task"><x-icon name="trash" class="h-4 w-4" /></button>
                </form>
            @endcan
        </x-slot:actions>
    </x-page-header>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main class="space-y-6">
            {{-- Progress + quick update: the primary action on this page --}}
            <section class="card">
                <div class="flex flex-wrap items-center justify-between gap-4 px-5 pt-5">
                    <div class="flex items-center gap-3">
                        <span class="metric">{{ $task->progress }}<span class="text-xl text-slate-400">%</span></span>
                        <div>
                            <p class="eyebrow">Progress</p>
                            <p class="text-sm text-slate-500">{{ $task->status->label() }}</p>
                        </div>
                    </div>
                    @if ($task->latest_remark)
                        <p class="max-w-md text-sm text-slate-500 italic">“{{ $task->latest_remark }}”</p>
                    @endif
                </div>
                <div class="px-5 pt-4">
                    <x-progress-bar :value="$task->progress" size="lg" :color="$task->status->color()" />
                </div>
                @can('update', $task)
                    <div class="mt-5 border-t border-slate-100 bg-slate-50/60 p-5">
                        <p class="eyebrow mb-3">Post an update</p>
                        <x-quick-update :task="$task" />
                    </div>
                @endcan
            </section>

            @if ($task->description)
                <section class="card">
                    <div class="card-header"><h2 class="card-title">Description</h2></div>
                    <div class="card-body">
                        <p class="text-sm leading-relaxed whitespace-pre-line text-slate-600">{{ $task->description }}</p>
                    </div>
                </section>
            @endif

            @if ($task->subtasks->isNotEmpty())
                <section class="card">
                    <div class="card-header">
                        <div>
                            <h2 class="card-title">Subtasks</h2>
                            <p class="mt-0.5 text-xs text-slate-500">This task's progress is calculated from its subtasks.</p>
                        </div>
                        @can('addSubtask', $task)
                            <a class="btn-secondary btn-sm" href="{{ route('tasks.create', ['parent_id' => $task->id]) }}"><x-icon name="plus" class="h-3.5 w-3.5" stroke="2" /> Add</a>
                        @endcan
                    </div>
                    <div class="divide-y divide-slate-100">
                        @foreach ($task->subtasks as $subtask)
                            <x-task-row :task="$subtask" :show-project="false" />
                        @endforeach
                    </div>
                </section>
            @endif

            @includeIf('tasks.partials.collaborators', ['task' => $task])
            @includeIf('tasks.partials.comments', ['task' => $task])
            @includeIf('tasks.partials.attachments', ['task' => $task])

            {{-- Append-only history --}}
            <section class="card">
                <div class="card-header">
                    <h2 class="card-title">History</h2>
                    <a class="link text-sm" href="{{ route('tasks.updates.index', $task) }}">Full history</a>
                </div>
                <div class="card-body">
                    <ol class="relative space-y-5 border-l border-slate-200 pl-6">
                        @foreach ($updates as $update)
                            <li class="relative">
                                <span class="absolute -left-[1.9rem] flex h-6 w-6 items-center justify-center rounded-full bg-white ring-4 ring-white">
                                    @if ($update->user)
                                        <x-avatar :user="$update->user" size="xs" :title="false" />
                                    @else
                                        <span class="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                            <x-icon name="refresh" class="h-3 w-3" />
                                        </span>
                                    @endif
                                </span>
                                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span class="text-sm font-medium text-slate-800">{{ $update->actorName() }}</span>
                                    <span class="text-xs text-slate-400" title="{{ $update->created_at->format('M j, Y g:i A') }}">{{ $update->created_at->diffForHumans() }}</span>
                                </div>
                                <div class="mt-1.5 flex flex-wrap items-center gap-2">
                                    @if ($update->statusChanged())
                                        <span class="inline-flex items-center gap-1.5">
                                            <x-status-badge :status="$update->old_status" size="sm" />
                                            <x-icon name="arrow-right" class="h-3 w-3 text-slate-400" />
                                            <x-status-badge :status="$update->new_status" size="sm" />
                                        </span>
                                    @elseif ($update->progressChanged())
                                        <span class="chip bg-slate-100 text-slate-600 tabular-nums">{{ $update->old_progress }}% → {{ $update->new_progress }}%</span>
                                    @else
                                        <span class="text-xs text-slate-500">{{ $update->type->label() }}</span>
                                    @endif
                                </div>
                                @if ($update->remark)
                                    <p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{{ $update->remark }}</p>
                                @endif
                            </li>
                        @endforeach
                    </ol>
                </div>
            </section>
        </main>

        <aside class="space-y-6">
            <section class="card self-start">
                <div class="card-header"><h2 class="card-title">People</h2></div>
                <div class="divide-y divide-slate-100">
                    <div class="flex items-center gap-3 px-5 py-3">
                        <x-avatar :user="$task->assignee" size="md" />
                        <div class="min-w-0">
                            <p class="eyebrow">Assignee</p>
                            <p class="truncate text-sm font-medium text-slate-800">{{ $task->assignee?->name ?? 'Unassigned' }}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 px-5 py-3">
                        <x-avatar :user="$task->creator" size="md" />
                        <div class="min-w-0">
                            <p class="eyebrow">Created by</p>
                            <p class="truncate text-sm font-medium text-slate-800">{{ $task->creator?->name ?? '—' }}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section class="card self-start">
                <div class="card-header"><h2 class="card-title">Details</h2></div>
                <dl class="divide-y divide-slate-100 text-sm">
                    @foreach ([['Project', $task->project?->name ?? '—'], ['Priority', $task->priority->label()], ['Start date', $task->start_date?->format('M j, Y') ?? '—'], ['Due date', $task->due_date?->format('M j, Y') ?? '—'], ['Completed', $task->completed_at?->format('M j, Y') ?? '—'], ['Created', $task->created_at->format('M j, Y')]] as [$label, $value])
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

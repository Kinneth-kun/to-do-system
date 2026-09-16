@props([
    'task',
    'showProject' => true,
    'showAssignee' => true,
    'showRemark' => true,
    'quickUpdate' => true,
])
@php
    /**
     * One task in a list. Eager-load for performance: project, assignee, parent, collaborators
     * (and optionally withCount(['subtasks as open_subtasks_count' => fn ($q) => $q->where('status', '!=', 'cancelled')])).
     *
     * @var \App\Models\Task $task
     */
    $canUpdate = $quickUpdate && auth()->user()?->can('update', $task);
    $c = $task->status->color();
@endphp
<div x-data="{ open: false }" {{ $attributes->merge(['class' => 'group']) }}>
    <div class="flex items-start gap-3 px-4 py-3 sm:items-center">
        <span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-{{ $c }}-500 sm:mt-0" title="{{ $task->status->label() }}"></span>

        <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                @if ($task->parent_id && $task->relationLoaded('parent') && $task->parent)
                    <span class="inline-flex max-w-[12rem] items-center gap-1 truncate text-xs text-slate-400">
                        <x-icon name="subtask" class="h-3 w-3 shrink-0" />{{ $task->parent->title }}
                    </span>
                @endif
                <a href="{{ route('tasks.show', $task) }}" class="truncate text-sm font-medium text-slate-900 hover:text-indigo-600 {{ $task->status === \App\Enums\TaskStatus::Completed ? 'text-slate-500 line-through decoration-slate-300' : '' }}">{{ $task->title }}</a>
                @if (in_array($task->priority, [\App\Enums\Priority::High, \App\Enums\Priority::Urgent], true))
                    <x-priority-badge :priority="$task->priority" />
                @endif
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                @if ($showProject && $task->project)
                    <a href="{{ route('projects.show', $task->project) }}" class="inline-flex max-w-[14rem] items-center gap-1.5 truncate hover:text-slate-700">
                        <span class="h-2 w-2 shrink-0 rounded-sm bg-{{ $task->project->color }}-500"></span>{{ $task->project->name }}
                    </a>
                @endif
                <x-due-date :task="$task" />
                <span class="sm:hidden"><x-status-badge :status="$task->status" size="sm" /></span>
            </div>
            @if ($showRemark && $task->latest_remark)
                <p class="mt-1 line-clamp-1 text-xs text-slate-500 italic">“{{ $task->latest_remark }}”</p>
            @endif
        </div>

        <div class="hidden w-28 shrink-0 md:block">
            <x-progress-bar :value="$task->progress" size="sm" :show-label="true" />
        </div>
        <span class="hidden shrink-0 sm:block"><x-status-badge :status="$task->status" /></span>
        @if ($showAssignee)
            <span class="hidden shrink-0 items-center gap-1.5 sm:flex">
                <x-avatar :user="$task->assignee" size="sm" />
                @if ($task->assignee?->department)
                    <x-department-badge :department="$task->assignee->department" size="sm" :short="true" class="hidden lg:inline-flex" />
                @endif
            </span>
        @endif
        @if ($canUpdate)
            <button type="button" class="btn-ghost btn-sm shrink-0" x-on:click="open = !open" x-bind:aria-expanded="open" title="Quick update">
                <x-icon name="pencil" class="h-4 w-4" />
                <span class="hidden lg:inline">Update</span>
            </button>
        @endif
    </div>
    @if ($canUpdate)
        <div x-show="open" x-collapse x-cloak>
            <div class="border-t border-dashed border-slate-200 bg-slate-50/70 px-4 py-4">
                <x-quick-update :task="$task" :compact="true">
                    <button type="button" class="btn-ghost btn-sm" x-on:click="open = false">Cancel</button>
                </x-quick-update>
            </div>
        </div>
    @endif
</div>

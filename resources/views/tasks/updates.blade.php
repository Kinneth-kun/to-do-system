<x-layouts.app :title="'History: '.$task->title">
    <x-page-header title="Update history" :description="$task->title" :back="route('tasks.show', $task)">
        <x-slot:meta>
            <div class="mt-3 flex flex-wrap items-center gap-2">
                <x-status-badge :status="$task->status" />
                <span class="text-sm text-slate-500">{{ $task->progress }}% complete</span>
                <span class="text-sm text-slate-400">· every change is kept permanently</span>
            </div>
        </x-slot:meta>
    </x-page-header>

    <div class="card">
        <div class="card-body">
            @if ($updates->isEmpty())
                <x-empty-state icon="history" title="No updates yet" description="Status and progress changes will be recorded here." />
            @else
                <ol class="relative space-y-6 border-l border-slate-200 pl-6">
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
                                <span class="text-xs text-slate-500">{{ $update->type->label() }}</span>
                                <time class="text-xs text-slate-400" title="{{ $update->created_at?->format('M j, Y g:i A') }}">
                                    {{ $update->created_at?->diffForHumans() }}
                                </time>
                            </div>

                            <div class="mt-2 flex flex-wrap items-center gap-2">
                                @if ($update->statusChanged())
                                    <span class="inline-flex items-center gap-1.5">
                                        <x-status-badge :status="$update->old_status" size="sm" />
                                        <x-icon name="arrow-right" class="h-3 w-3 text-slate-400" />
                                        <x-status-badge :status="$update->new_status" size="sm" />
                                    </span>
                                @endif
                                @if ($update->progressChanged())
                                    <span class="chip bg-slate-100 text-slate-600 tabular-nums">{{ $update->old_progress }}% → {{ $update->new_progress }}%</span>
                                @endif
                            </div>

                            @if ($update->remark)
                                <p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-line text-slate-600">{{ $update->remark }}</p>
                            @endif
                        </li>
                    @endforeach
                </ol>
            @endif
        </div>
    </div>

    @if ($updates->hasPages())
        <div class="mt-6">{{ $updates->links() }}</div>
    @endif
</x-layouts.app>

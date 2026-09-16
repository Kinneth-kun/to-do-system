@php($collaborators = $task->relationLoaded('collaborators') ? $task->collaborators : $task->collaborators()->get())
<div class="card">
    <div class="card-header flex items-center justify-between gap-3">
        <h2 class="card-title">Collaborators</h2>
        @can('manageCollaborators', $task)
            <span class="text-xs text-slate-500">{{ $collaborators->count() }}</span>
        @endcan
    </div>
    <div class="card-body space-y-4">
        @if ($collaborators->isNotEmpty())
            <div class="flex flex-wrap gap-3">
                @foreach ($collaborators as $collaborator)
                    <div class="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                        <x-avatar :user="$collaborator" size="sm" />
                        <span class="max-w-32 truncate text-sm text-slate-700">{{ $collaborator->name }}</span>
                        @can('manageCollaborators', $task)
                            <form method="POST" action="{{ route('tasks.collaborators.destroy', [$task, $collaborator]) }}" x-data="confirmable({ title: 'Remove collaborator', message: 'They will stop receiving updates about this task.', confirm: 'Remove', danger: false })" x-on:submit.prevent="ask($event)">
                                @csrf
                                @method('DELETE')
                                <button type="submit" class="btn-icon h-7 w-7 text-slate-400 hover:text-red-600" aria-label="Remove {{ $collaborator->name }}">
                                    <x-icon name="x" class="h-4 w-4" />
                                </button>
                            </form>
                        @endcan
                    </div>
                @endforeach
            </div>
        @else
            <p class="text-sm text-slate-500">No collaborators yet.</p>
        @endif
        @can('manageCollaborators', $task)
            <form method="POST" action="{{ route('tasks.collaborators.store', $task) }}" class="flex flex-col gap-2 sm:flex-row">
                @csrf
                <input class="form-input flex-1" type="number" name="user_id" min="1" placeholder="User ID" required aria-label="User ID">
                <button class="btn-secondary btn-sm" type="submit"><x-icon name="user-plus" class="h-4 w-4" /> Add</button>
            </form>
        @endcan
    </div>
</div>

@php($attachments = $task->relationLoaded('attachments') ? $task->attachments : $task->attachments()->with('user')->get())
<div class="card">
    <div class="card-header flex items-center justify-between gap-3">
        <h2 class="card-title">Attachments</h2>
        <span class="text-xs text-slate-500">{{ $attachments->count() }}</span>
    </div>
    <div class="card-body space-y-3">
        @forelse ($attachments as $attachment)
            <div class="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><x-icon name="paperclip" class="h-4 w-4" /></span>
                <div class="min-w-0 flex-1">
                    <a class="block truncate text-sm font-medium text-indigo-600 hover:text-indigo-700" href="{{ route('attachments.show', $attachment) }}">{{ $attachment->original_name }}</a>
                    <p class="text-xs text-slate-500">{{ $attachment->humanSize() }} · {{ $attachment->user?->name ?? 'Unknown user' }}</p>
                </div>
                @can('comment', $task)
                    @if ($attachment->user_id === auth()->id() || auth()->user()->can('edit', $task))
                        <form method="POST" action="{{ route('attachments.destroy', $attachment) }}" onsubmit="return confirm('Delete this attachment?')">
                            @csrf
                            @method('DELETE')
                            <button type="submit" class="btn-icon text-slate-400 hover:text-red-600" aria-label="Delete {{ $attachment->original_name }}"><x-icon name="trash" class="h-4 w-4" /></button>
                        </form>
                    @endif
                @endcan
            </div>
        @empty
            <p class="text-sm text-slate-500">No attachments yet.</p>
        @endforelse
        @can('comment', $task)
            <form method="POST" action="{{ route('tasks.attachments.store', $task) }}" enctype="multipart/form-data" class="border-t border-slate-100 pt-4">
                @csrf
                <label class="form-label" for="attachment-file">Upload a file</label>
                <input id="attachment-file" name="file" type="file" class="form-input mt-1" required>
                <p class="form-help">Images and common documents up to 10 MB.</p>
                <div class="mt-2 flex justify-end"><button class="btn-secondary btn-sm" type="submit"><x-icon name="upload" class="h-4 w-4" /> Upload</button></div>
            </form>
        @endcan
    </div>
</div>

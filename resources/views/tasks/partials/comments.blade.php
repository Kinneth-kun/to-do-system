@php($comments = $task->relationLoaded('comments') ? $task->comments : $task->comments()->with('user')->oldest()->get())
<div class="card">
    <div class="card-header">
        <h2 class="card-title">Comments</h2>
    </div>
    <div class="card-body space-y-5">
        @forelse ($comments as $comment)
            <article class="flex gap-3">
                <x-avatar :user="$comment->user" size="sm" />
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p class="text-sm font-semibold text-slate-900">{{ $comment->user?->name ?? 'Unknown user' }}</p>
                        <time class="text-xs text-slate-400" datetime="{{ $comment->created_at?->toIso8601String() }}">{{ $comment->created_at?->diffForHumans() }}</time>
                    </div>
                    <p class="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{{ $comment->body }}</p>
                    @can('comment', $task)
                        @if ($comment->user_id === auth()->id() || auth()->user()->can('edit', $task))
                            <form method="POST" action="{{ route('comments.destroy', $comment) }}" class="mt-2" x-data="confirmable({ title: 'Delete comment', message: 'This removes the comment for everyone on the task.', confirm: 'Delete' })" x-on:submit.prevent="ask($event)">
                                @csrf
                                @method('DELETE')
                                <button class="text-xs font-medium text-red-600 hover:text-red-700" type="submit">Delete</button>
                            </form>
                        @endif
                    @endcan
                </div>
            </article>
        @empty
            <p class="text-sm text-slate-500">No comments yet.</p>
        @endforelse
        @can('comment', $task)
            <form method="POST" action="{{ route('tasks.comments.store', $task) }}" class="border-t border-slate-100 pt-4">
                @csrf
                <label class="form-label" for="comment-body">Add a comment</label>
                <textarea id="comment-body" name="body" class="form-input mt-1" rows="3" maxlength="10000" placeholder="Write a comment or mention @username…" required></textarea>
                <div class="mt-2 flex justify-end">
                    <button class="btn-primary btn-sm" type="submit"><x-icon name="chat" class="h-4 w-4" /> Comment</button>
                </div>
            </form>
        @endcan
    </div>
</div>

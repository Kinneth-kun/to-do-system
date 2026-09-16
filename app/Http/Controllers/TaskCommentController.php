<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskComment;
use App\Services\ActivityLogger;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class TaskCommentController extends Controller
{
    public function store(Request $request, Task $task): RedirectResponse
    {
        Gate::authorize('comment', $task);
        $data = $request->validate(['body' => ['required', 'string', 'max:10000']]);
        $comment = $task->comments()->create(['user_id' => $request->user()->id, 'body' => trim($data['body'])]);

        ActivityLogger::log('comment.added', $request->user()->name.' commented on "'.$task->title.'"', $task, [], $request->user());
        NotificationService::mentions($comment->body, $task, $comment, $request->user());

        return back()->with('success', 'Comment added.');
    }

    public function destroy(Request $request, TaskComment $comment): RedirectResponse
    {
        $task = $comment->task;
        abort_unless($request->user()->can('comment', $task) && ($comment->user_id === $request->user()->id || $request->user()->can('edit', $task)), 403);

        ActivityLogger::log('comment.deleted', $request->user()->name.' deleted a comment on "'.$task->title.'"', $task, ['comment_id' => $comment->id], $request->user());
        $comment->delete();

        return back()->with('success', 'Comment deleted.');
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\Attachment;
use App\Models\Task;
use App\Services\ActivityLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

class AttachmentController extends Controller
{
    public function store(Request $request, Task $task): RedirectResponse
    {
        Gate::authorize('comment', $task);
        $data = $request->validate(['file' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,zip']]);
        $file = $data['file'];
        $path = $file->store('attachments');
        $attachment = $task->attachments()->create([
            'user_id' => $request->user()->id,
            'original_name' => $file->getClientOriginalName(),
            'path' => $path,
            'disk' => config('filesystems.default', 'local'),
            'mime_type' => $file->getMimeType(),   // server-detected, not the browser's claim
            'size' => $file->getSize(),
        ]);

        ActivityLogger::log('attachment.uploaded', $request->user()->name.' uploaded "'.$attachment->original_name.'" to "'.$task->title.'"', $task, ['attachment_id' => $attachment->id], $request->user());

        return back()->with('success', 'Attachment uploaded.');
    }

    public function show(Request $request, Attachment $attachment)
    {
        $task = $attachment->attachable instanceof Task ? $attachment->attachable : $attachment->attachable?->task;
        abort_unless($task instanceof Task, 404);
        Gate::authorize('view', $task);

        return Storage::disk($attachment->disk)->download($attachment->path, $attachment->original_name, ['Content-Type' => $attachment->mime_type ?: 'application/octet-stream']);
    }

    public function destroy(Request $request, Attachment $attachment): RedirectResponse
    {
        $task = $attachment->attachable instanceof Task ? $attachment->attachable : $attachment->attachable?->task;
        abort_unless($task instanceof Task, 404);
        Gate::authorize('comment', $task);
        abort_unless($attachment->user_id === $request->user()->id || $request->user()->can('edit', $task), 403);

        ActivityLogger::log('attachment.deleted', $request->user()->name.' deleted "'.$attachment->original_name.'" from "'.$task->title.'"', $task, ['attachment_id' => $attachment->id], $request->user());
        $attachment->delete();

        return back()->with('success', 'Attachment deleted.');
    }
}

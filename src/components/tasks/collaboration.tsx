'use client';

import { useState } from 'react';
import { addCollaboratorAction, addCommentAction, registerBlobAttachmentAction, uploadAttachmentAction } from '@/app/actions/tasks';
import { Icon } from '../icon';
import { ActionForm, SubmitButton, useFieldError } from '../client/form';
import { toast } from '../client/toaster';

/* ------------------------------------------------------------------ collaborators */

function PersonSelect({ people }: { people: { id: number; name: string; username: string }[] }) {
    const error = useFieldError('user_id');
    return (
        <div className="min-w-0 flex-1">
            <select name="user_id" className={`form-select ${error ? 'border-red-400' : ''}`} required defaultValue="" aria-label="Add a collaborator">
                <option value="">Add someone…</option>
                {people.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name} ({p.username})
                    </option>
                ))}
            </select>
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

export function AddCollaboratorForm({ taskId, people }: { taskId: number; people: { id: number; name: string; username: string }[] }) {
    if (!people.length) return <p className="text-xs text-slate-500">Everyone active is already on this task.</p>;
    return (
        <ActionForm action={addCollaboratorAction.bind(null, taskId)} resetOnSuccess className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <PersonSelect people={people} />
            <SubmitButton className="btn-secondary btn-sm shrink-0 sm:mt-0.5">
                <Icon name="user-plus" className="h-4 w-4" /> Add
            </SubmitButton>
        </ActionForm>
    );
}

/* ------------------------------------------------------------------ comments */

function CommentBody() {
    const error = useFieldError('body');
    return (
        <>
            <label className="form-label" htmlFor="comment-body">
                Add a comment
            </label>
            <textarea id="comment-body" name="body" className={`form-input mt-1 ${error ? 'border-red-400' : ''}`} rows={3} maxLength={10000} placeholder="Write a comment or mention @username…" required />
            {error && <p className="form-error">{error}</p>}
        </>
    );
}

export function CommentForm({ taskId }: { taskId: number }) {
    return (
        <ActionForm action={addCommentAction.bind(null, taskId)} resetOnSuccess className="border-t border-slate-100 pt-4">
            <CommentBody />
            <div className="mt-2 flex justify-end">
                <SubmitButton className="btn-primary btn-sm" pendingText="Posting…">
                    <Icon name="chat" className="h-4 w-4" /> Comment
                </SubmitButton>
            </div>
        </ActionForm>
    );
}

/* ------------------------------------------------------------------ attachments */

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'];

const safeName = (name: string) => name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100) || 'file';

function FileError() {
    const error = useFieldError('file');
    return error ? <p className="form-error">{error}</p> : null;
}

/**
 * Upload a file to the task. With Vercel Blob configured the browser uploads straight to Blob
 * (function bodies are capped at 4.5 MB, below the 10 MB limit) and the server then verifies and
 * records it; otherwise the file goes through a Server Action to local storage.
 */
export function AttachmentUploader({ taskId, blob, access }: { taskId: number; blob: boolean; access: 'public' | 'private' }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const footer = (
        <>
            <p className="form-help">Images and common documents up to 10 MB.</p>
            <div className="mt-2 flex justify-end">
                <SubmitButton className="btn-secondary btn-sm" pendingText="Uploading…" disabled={busy}>
                    <Icon name="upload" className="h-4 w-4" /> {busy ? 'Uploading…' : 'Upload'}
                </SubmitButton>
            </div>
        </>
    );

    if (!blob) {
        return (
            <ActionForm action={uploadAttachmentAction.bind(null, taskId)} resetOnSuccess className="border-t border-slate-100 pt-4">
                <label className="form-label" htmlFor="attachment-file">
                    Upload a file
                </label>
                <input id="attachment-file" name="file" type="file" className="form-input mt-1" required accept={EXTENSIONS.map((e) => `.${e}`).join(',')} />
                <FileError />
                {footer}
            </ActionForm>
        );
    }

    return (
        <form
            className="border-t border-slate-100 pt-4"
            onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0];
                setError(null);
                if (!file) return setError('The file field is required.');
                if (file.size > MAX_BYTES) return setError('The file field must not be greater than 10240 kilobytes.');
                if (!EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) return setError(`The file field must be a file of type: ${EXTENSIONS.join(', ')}.`);

                setBusy(true);
                try {
                    const { upload } = await import('@vercel/blob/client');
                    const result = await upload(`attachments/task-${taskId}/${safeName(file.name)}`, file, {
                        access,
                        handleUploadUrl: '/api/attachments/upload',
                        clientPayload: JSON.stringify({ taskId }),
                        multipart: file.size > 4 * 1024 * 1024,
                    });
                    const state = await registerBlobAttachmentAction(taskId, { pathname: result.pathname, originalName: file.name });
                    if (state?.errors) setError(Object.values(state.errors)[0]);
                    else form.reset();
                } catch {
                    toast('The upload failed. Please try again.', 'error');
                } finally {
                    setBusy(false);
                }
            }}
        >
            <label className="form-label" htmlFor="attachment-file">
                Upload a file
            </label>
            <input id="attachment-file" name="file" type="file" className="form-input mt-1" required accept={EXTENSIONS.map((e) => `.${e}`).join(',')} />
            {error && <p className="form-error">{error}</p>}
            <p className="form-help">Images and common documents up to 10 MB.</p>
            <div className="mt-2 flex justify-end">
                <button type="submit" className="btn-secondary btn-sm" disabled={busy}>
                    <Icon name="upload" className="h-4 w-4" /> {busy ? 'Uploading…' : 'Upload'}
                </button>
            </div>
        </form>
    );
}

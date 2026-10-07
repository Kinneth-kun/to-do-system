'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addSuggestionAction, attachSuggestionFileAction, deleteSuggestionAction, registerSuggestionBlobAction } from '@/app/actions/projects';
import { IMAGE_EXTENSIONS, MAX_SUGGESTION_FILES, safeUploadName, uploadAccept, uploadExtension, uploadProblem } from '@/lib/upload-rules';
import type { UserLite } from '@/lib/users';
import type { FormState } from '@/lib/validation';
import { ConfirmForm } from '../client/confirm';
import { toast } from '../client/toaster';
import { Icon } from '../icon';
import { Avatar } from '../ui';

export type SuggestionFile = { id: number; name: string; size: string; image: boolean };

export type SuggestionItem = {
    id: number;
    body: string;
    author: UserLite | null;
    /** "2 hours ago" and the full date — formatted on the server, which knows the app's timezone. */
    when: string;
    whenTitle: string;
    /** Reference images and documents, shown as thumbnails / file chips. */
    files: SuggestionFile[];
    canDelete: boolean;
};

type Picked = { key: number; file: File; preview: string | null };

/** A pasted screenshot arrives as "image.png"; give it a name that tells files apart. */
const nameScreenshot = (file: File, i: number) =>
    file.name && file.name !== 'image.png' ? file : new File([file], `screenshot-${Date.now()}${i ? `-${i}` : ''}.${uploadExtension(file.name) || 'png'}`, { type: file.type });

/**
 * The one-line box for a new suggestion, with up to five reference files (paperclip, or paste a
 * screenshot). The suggestion is posted first, then each file is attached to it in its own
 * request — straight to Vercel Blob when configured, else through a Server Action — so every
 * upload stays under the request size limit.
 */
function AddSuggestion({ projectId, blob, access }: { projectId: number; blob: boolean; access: 'public' | 'private' }) {
    const [picked, setPicked] = useState<Picked[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const picker = useRef<HTMLInputElement>(null);
    const nextKey = useRef(0);
    const latest = useRef(picked);
    useEffect(() => {
        latest.current = picked;
    }, [picked]);

    // Release the image previews when the card goes away.
    useEffect(() => () => latest.current.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), []);

    const add = (list: File[]) => {
        if (!list.length) return;
        const problem = list.map(uploadProblem).find(Boolean);
        const ok = list.filter((f) => !uploadProblem(f));
        const room = MAX_SUGGESTION_FILES - picked.length;
        setError(problem ?? (ok.length > room ? `You can attach up to ${MAX_SUGGESTION_FILES} files.` : null));
        const added = ok.slice(0, Math.max(0, room)).map((file) => ({
            key: nextKey.current++,
            file,
            preview: IMAGE_EXTENSIONS.includes(uploadExtension(file.name)) ? URL.createObjectURL(file) : null,
        }));
        setPicked([...picked, ...added]);
    };

    const remove = (key: number) => {
        const item = picked.find((p) => p.key === key);
        if (item?.preview) URL.revokeObjectURL(item.preview);
        setPicked(picked.filter((p) => p.key !== key));
        setError(null);
    };

    const attach = async (suggestionId: number, file: File): Promise<FormState> => {
        if (!blob) {
            const data = new FormData();
            data.set('file', file);
            return attachSuggestionFileAction(suggestionId, data);
        }
        const { upload } = await import('@vercel/blob/client');
        const result = await upload(`attachments/suggestion-${suggestionId}/${safeUploadName(file.name)}`, file, {
            access,
            handleUploadUrl: '/api/attachments/upload',
            clientPayload: JSON.stringify({ suggestionId }),
            multipart: file.size > 4 * 1024 * 1024,
        });
        return registerSuggestionBlobAction(suggestionId, { pathname: result.pathname, originalName: file.name });
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(true);
        setError(null);
        try {
            const state = await addSuggestionAction(projectId, null, new FormData(form));
            if (!state?.ok || !state.id) {
                setError(state?.errors ? Object.values(state.errors)[0] : 'The suggestion could not be posted.');
                return;
            }

            const failed: string[] = [];
            for (const { file } of picked) {
                try {
                    if ((await attach(state.id, file))?.errors) failed.push(file.name);
                } catch {
                    failed.push(file.name);
                }
            }
            if (failed.length) toast(`Posted, but these files could not be attached: ${failed.join(', ')}`, 'error');

            form.reset();
            picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
            setPicked([]);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <div className="flex items-center gap-1.5">
                <input
                    name="body"
                    required
                    maxLength={1000}
                    placeholder="Add a recommendation or suggestion…"
                    aria-label="Add a recommendation or suggestion"
                    className="form-input h-8 min-w-0 flex-1 py-1 text-xs"
                    onPaste={(e) => {
                        const pasted = [...e.clipboardData.files];
                        if (!pasted.length) return;
                        e.preventDefault();
                        add(pasted.map(nameScreenshot));
                    }}
                />
                <input
                    ref={picker}
                    type="file"
                    multiple
                    accept={uploadAccept}
                    className="hidden"
                    onChange={(e) => {
                        add([...(e.target.files ?? [])]);
                        e.target.value = '';
                    }}
                />
                <button
                    type="button"
                    className="btn-secondary btn-sm h-8 shrink-0 px-2"
                    onClick={() => picker.current?.click()}
                    disabled={busy || picked.length >= MAX_SUGGESTION_FILES}
                    aria-label="Attach images or files"
                    title="Attach images or files (or paste a screenshot)"
                >
                    <Icon name="paperclip" className="h-3.5 w-3.5" />
                </button>
                <button type="submit" className="btn-primary btn-sm h-8 shrink-0 px-2.5" disabled={busy} aria-label="Post suggestion">
                    <Icon name={busy ? 'refresh' : 'arrow-right'} className={busy ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} stroke={2} />
                </button>
            </div>

            {picked.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Files to attach">
                    {picked.map(({ key, file, preview }) => (
                        <li key={key} className="relative" title={file.name}>
                            {preview ? (
                                // eslint-disable-next-line @next/next/no-img-element -- a local preview (object URL)
                                <img src={preview} alt={file.name} className="h-10 w-10 rounded-md object-cover ring-1 ring-slate-200" />
                            ) : (
                                <span className="inline-flex h-10 max-w-[9rem] items-center gap-1 rounded-md bg-white px-2 text-[11px] text-slate-600 ring-1 ring-slate-200">
                                    <Icon name="paperclip" className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{file.name}</span>
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => remove(key)}
                                disabled={busy}
                                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-red-600"
                                aria-label={`Remove ${file.name}`}
                            >
                                <Icon name="x" className="h-2.5 w-2.5" stroke={2.5} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {error && <p className="form-error">{error}</p>}
        </form>
    );
}

/** A posted suggestion's reference files: image thumbnails (open full size) and document chips (download). */
function SuggestionFiles({ files }: { files: SuggestionFile[] }) {
    if (!files.length) return null;
    return (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
            {files.map((f) =>
                f.image ? (
                    <a
                        key={f.id}
                        href={`/attachments/${f.id}?inline=1`}
                        target="_blank"
                        rel="noopener"
                        title={`${f.name} · ${f.size}`}
                        className="block h-12 w-12 overflow-hidden rounded-md bg-white ring-1 ring-slate-200 transition hover:ring-indigo-400"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element -- streamed through the authorised /attachments route */}
                        <img src={`/attachments/${f.id}?inline=1`} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
                    </a>
                ) : (
                    <a
                        key={f.id}
                        href={`/attachments/${f.id}`}
                        title={`Download ${f.name} · ${f.size}`}
                        className="inline-flex h-7 max-w-full items-center gap-1 rounded-md bg-white px-2 text-[11px] text-slate-600 ring-1 ring-slate-200 transition hover:text-indigo-600 hover:ring-indigo-300"
                    >
                        <Icon name="paperclip" className="h-3 w-3 shrink-0" />
                        <span className="max-w-[9rem] truncate">{f.name}</span>
                        <span className="shrink-0 text-slate-400">{f.size}</span>
                    </a>
                ),
            )}
        </div>
    );
}

/**
 * Recommendations and suggestions on a project card: one at a time, newest first, with arrows to
 * page through them and a one-line box to add another (with reference images or files).
 */
export function SuggestionStrip({
    projectId,
    suggestions,
    total,
    blob,
    access,
}: {
    projectId: number;
    suggestions: SuggestionItem[];
    total: number;
    blob: boolean;
    access: 'public' | 'private';
}) {
    const [index, setIndex] = useState(0);
    const newestId = suggestions[0]?.id;

    // Jump back to the newest after posting; stay in range after a removal.
    useEffect(() => setIndex(0), [newestId]);
    const current = suggestions[Math.min(index, suggestions.length - 1)];
    const position = Math.min(index, suggestions.length - 1);

    const arrow = 'inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-800 disabled:pointer-events-none disabled:text-slate-300';

    return (
        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    <Icon name="chat" className="h-3.5 w-3.5" /> Suggestions
                </p>
                {suggestions.length > 1 && (
                    <div className="flex items-center gap-0.5">
                        <button type="button" className={arrow} onClick={() => setIndex(position - 1)} disabled={position === 0} aria-label="Newer suggestion">
                            <Icon name="chevron-left" className="h-3.5 w-3.5" />
                        </button>
                        <span className="px-1 text-[11px] text-slate-500 tabular-nums">
                            {position + 1} of {total}
                        </span>
                        <button type="button" className={arrow} onClick={() => setIndex(position + 1)} disabled={position >= suggestions.length - 1} aria-label="Older suggestion">
                            <Icon name="chevron-right" className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {current ? (
                <div className="mb-2.5 flex items-start gap-2">
                    <Avatar user={current.author} size="xs" />
                    <div className="min-w-0 flex-1">
                        <p className="line-clamp-3 text-sm leading-snug break-words text-slate-700" title={current.body}>
                            {current.body}
                        </p>
                        <SuggestionFiles files={current.files} />
                        <p className="mt-0.5 text-[11px] text-slate-400">
                            {current.author?.name ?? 'Former user'} ·{' '}
                            <time title={current.whenTitle}>{current.when}</time>
                        </p>
                    </div>
                    {current.canDelete && (
                        <ConfirmForm action={deleteSuggestionAction.bind(null, current.id)} title="Remove suggestion" message="This removes the suggestion and its files for everyone." confirm="Remove">
                            <button type="submit" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600" aria-label="Remove suggestion">
                                <Icon name="trash" className="h-3.5 w-3.5" />
                            </button>
                        </ConfirmForm>
                    )}
                </div>
            ) : (
                <p className="mb-2.5 text-xs text-slate-400">No suggestions yet — be the first.</p>
            )}

            <AddSuggestion projectId={projectId} blob={blob} access={access} />
        </div>
    );
}

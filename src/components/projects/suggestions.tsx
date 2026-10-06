'use client';

import { useEffect, useState } from 'react';
import { addSuggestionAction, deleteSuggestionAction } from '@/app/actions/projects';
import type { UserLite } from '@/lib/users';
import { ConfirmForm } from '../client/confirm';
import { ActionForm, useFieldError, useFormPending } from '../client/form';
import { Icon } from '../icon';
import { Avatar } from '../ui';

export type SuggestionItem = {
    id: number;
    body: string;
    author: UserLite | null;
    /** "2 hours ago" and the full date — formatted on the server, which knows the app's timezone. */
    when: string;
    whenTitle: string;
    canDelete: boolean;
};

function AddSuggestion() {
    const error = useFieldError('body');
    const pending = useFormPending();
    return (
        <div>
            <div className="flex items-center gap-1.5">
                <input
                    name="body"
                    required
                    maxLength={1000}
                    placeholder="Add a recommendation or suggestion…"
                    aria-label="Add a recommendation or suggestion"
                    className="form-input h-8 min-w-0 flex-1 py-1 text-xs"
                />
                <button type="submit" className="btn-primary btn-sm h-8 shrink-0 px-2.5" disabled={pending} aria-label="Post suggestion">
                    <Icon name="arrow-right" className="h-3.5 w-3.5" stroke={2} />
                </button>
            </div>
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

/**
 * Recommendations and suggestions on a project card: one at a time, newest first, with arrows to
 * page through them and a one-line box to add another.
 */
export function SuggestionStrip({ projectId, suggestions, total }: { projectId: number; suggestions: SuggestionItem[]; total: number }) {
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
                        <p className="mt-0.5 text-[11px] text-slate-400">
                            {current.author?.name ?? 'Former user'} ·{' '}
                            <time title={current.whenTitle}>{current.when}</time>
                        </p>
                    </div>
                    {current.canDelete && (
                        <ConfirmForm action={deleteSuggestionAction.bind(null, current.id)} title="Remove suggestion" message="This removes the suggestion for everyone." confirm="Remove">
                            <button type="submit" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600" aria-label="Remove suggestion">
                                <Icon name="trash" className="h-3.5 w-3.5" />
                            </button>
                        </ConfirmForm>
                    )}
                </div>
            ) : (
                <p className="mb-2.5 text-xs text-slate-400">No suggestions yet — be the first.</p>
            )}

            <ActionForm action={addSuggestionAction.bind(null, projectId)} resetOnSuccess>
                <AddSuggestion />
            </ActionForm>
        </div>
    );
}

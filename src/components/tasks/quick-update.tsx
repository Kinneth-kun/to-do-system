'use client';

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { quickUpdateAction } from '@/app/actions/tasks';
import { TaskStatus } from '@/lib/enums';
import type { FormState } from '@/lib/validation';
import { Icon } from '../icon';
import { submitInTransition } from '../client/form';

/*
 * Quick status / progress / remark update. Mirrors TaskService's rules client-side so the form
 * never shows an impossible combination: 0% Pending, 1–99% In Progress, 100% Completed.
 */
export function QuickUpdate({
    taskId,
    status: initialStatus,
    progress: initialProgress,
    compact = false,
    onDone,
    children,
}: {
    taskId: number;
    status: TaskStatus;
    progress: number;
    compact?: boolean;
    onDone?: () => void;
    children?: ReactNode;
}) {
    const uid = useId();
    const [state, action, pending] = useActionState<FormState, FormData>(quickUpdateAction.bind(null, taskId), null);
    const remark = useRef<HTMLTextAreaElement>(null);
    const [status, setStatus] = useState<TaskStatus>(initialStatus);
    const [progress, setProgress] = useState(initialProgress);

    // Re-sync after the server re-renders the task with its saved values.
    useEffect(() => setStatus(initialStatus), [initialStatus]);
    useEffect(() => setProgress(initialProgress), [initialProgress]);
    useEffect(() => {
        if (!state?.ok) return;
        if (remark.current) remark.current.value = '';
        onDone?.();
    }, [state, onDone]);

    const onProgress = (value: number) => {
        setProgress(value);
        if (['pending', 'in_progress', 'completed'].includes(status) || value === 100) {
            setStatus(value <= 0 ? 'pending' : value >= 100 ? 'completed' : 'in_progress');
        }
    };

    const onStatus = (value: TaskStatus) => {
        setStatus(value);
        if (value === 'pending') setProgress(0);
        else if (value === 'completed') setProgress(100);
        else if (value === 'in_progress') setProgress((p) => Math.min(99, Math.max(p, 1)));
    };

    const small = compact ? 'text-xs' : '';

    return (
        <form onSubmit={(event) => submitInTransition(event, action)} className={compact ? 'space-y-3' : 'space-y-4'}>
            <div className={`grid gap-3 ${compact ? 'sm:grid-cols-[minmax(0,11rem)_1fr]' : 'sm:grid-cols-2'}`}>
                <div>
                    <label htmlFor={`${uid}-status`} className={`form-label ${small}`}>
                        Status
                    </label>
                    <select id={`${uid}-status`} name="status" className="form-select" value={status} onChange={(e) => onStatus(e.target.value as TaskStatus)}>
                        {TaskStatus.options().map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor={`${uid}-progress`} className={`form-label flex items-center justify-between ${small}`}>
                        <span>Progress</span>
                        <span className="font-semibold text-indigo-600 tabular-nums">{progress}%</span>
                    </label>
                        <div className="flex items-center gap-3 pt-1.5">
                            <input
                                id={`${uid}-progress`}
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                name="progress"
                                className="progress-range w-full"
                                value={progress}
                                onChange={(e) => onProgress(Number(e.target.value))}
                            />
                            <div className="hidden gap-1 sm:flex">
                                {[0, 50, 100].map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                        onClick={() => onProgress(preset)}
                                    >
                                        {preset}%
                                    </button>
                                ))}
                            </div>
                        </div>
                </div>
            </div>
            <div>
                <label htmlFor={`${uid}-remark`} className={`form-label ${small}`}>
                    Remark <span className="font-normal text-slate-400">(optional — use @username to mention)</span>
                </label>
                <textarea ref={remark} id={`${uid}-remark`} name="remark" rows={compact ? 2 : 3} maxLength={2000} className="form-input" placeholder="What changed? Any blockers?" />
                {state?.errors?.remark && <p className="form-error">{state.errors.remark}</p>}
                {state?.errors?._form && <p className="form-error">{state.errors._form}</p>}
            </div>
            <div className="flex items-center justify-end gap-2">
                {children}
                <button type="submit" className={`btn-primary ${compact ? 'btn-sm' : ''}`} disabled={pending}>
                    <Icon name="check" className="h-4 w-4" stroke={2} /> {pending ? 'Saving…' : 'Save update'}
                </button>
            </div>
        </form>
    );
}

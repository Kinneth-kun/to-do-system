'use client';

import { addDays } from '@/lib/dates';
import { Icon } from '../icon';
import { cx } from '../ui';

/*
 * A task either belongs to a project (long-term work that feeds the project's progress and
 * health) or stands alone — a one-off finished in a day or a week. Both task forms share this
 * choice and the due-date shortcuts that go with short-term work.
 */

export type TaskKind = 'project' | 'standalone';

const KINDS: { value: TaskKind; label: string; icon: string; hint: string }[] = [
    { value: 'project', label: 'Part of a project', icon: 'folder', hint: 'Long-term work that counts toward a project’s progress.' },
    { value: 'standalone', label: 'Standalone task', icon: 'bolt', hint: 'A one-off you’ll finish in a day or a week. No project needed.' },
];

/** Radio cards (full form) or a two-segment pill (`compact`, quick create). Submits `kind`. */
export function TaskKindToggle({ value, onChange, compact = false, idPrefix = 'kind' }: { value: TaskKind; onChange: (kind: TaskKind) => void; compact?: boolean; idPrefix?: string }) {
    if (compact) {
        return (
            <div role="radiogroup" aria-label="Task type" className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                {KINDS.map((k) => (
                    <label
                        key={k.value}
                        className={cx(
                            'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500/40',
                            value === k.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                        )}
                    >
                        <input type="radio" name="kind" value={k.value} checked={value === k.value} onChange={() => onChange(k.value)} className="sr-only" />
                        <Icon name={k.icon} className="h-4 w-4" />
                        {k.value === 'project' ? 'In a project' : 'Standalone'}
                    </label>
                ))}
            </div>
        );
    }

    return (
        <fieldset className="mb-5">
            <legend className="form-label">What kind of task is this?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
                {KINDS.map((k) => {
                    const on = value === k.value;
                    return (
                        <label
                            key={k.value}
                            htmlFor={`${idPrefix}-${k.value}`}
                            className={cx(
                                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500/40',
                                on ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:border-slate-300',
                            )}
                        >
                            <input id={`${idPrefix}-${k.value}`} type="radio" name="kind" value={k.value} checked={on} onChange={() => onChange(k.value)} className="sr-only" />
                            <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500')}>
                                <Icon name={k.icon} className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-900">{k.label}</span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{k.hint}</span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

const PRESETS: { label: string; days: number }[] = [
    { label: 'Today', days: 0 },
    { label: 'Tomorrow', days: 1 },
    { label: 'In 3 days', days: 3 },
    { label: 'In 1 week', days: 7 },
];

/**
 * One-click due dates for short-term work. Fills the (uncontrolled) date input `inputId`.
 * `today` comes from the server, which knows the application's timezone.
 */
export function DueDatePresets({ inputId, today }: { inputId: string; today: string }) {
    const pick = (days: number) => {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (!input) return;
        input.value = addDays(today, days);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    return (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Due date shortcuts">
            {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => pick(p.days)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">
                    {p.label}
                </button>
            ))}
        </div>
    );
}

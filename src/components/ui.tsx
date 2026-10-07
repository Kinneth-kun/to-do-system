import Link from 'next/link';
import type { ReactNode } from 'react';
import { Department, Priority, ProjectHealth, ProjectStatus, TaskCategory, TaskStatus, taskStatusColor } from '@/lib/enums';
import type { DueState } from '@/lib/task-utils';
import { Icon } from './icon';

/*
 * Presentational components, ported from resources/views/components/*. No hooks, so they work
 * in both Server and Client Components.
 */

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

export type AvatarUser = { name: string; avatarColor: string } | null | undefined;

export function initialsOf(name: string): string {
    return (
        name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]!.toUpperCase())
            .join('') || '?'
    );
}

const AVATAR_SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base', xl: 'h-16 w-16 text-xl' };

export function Avatar({ user, size = 'sm', title = true, className }: { user: AvatarUser; size?: keyof typeof AVATAR_SIZES; title?: boolean; className?: string }) {
    if (!user) {
        return (
            <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-slate-400', AVATAR_SIZES[size], className)} title="Unassigned">
                <Icon name="user" className="h-3/5 w-3/5" />
            </span>
        );
    }
    const c = user.avatarColor || 'slate';
    return (
        <span
            className={cx(`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white bg-${c}-100 text-${c}-700`, AVATAR_SIZES[size], className)}
            title={title ? user.name : undefined}
        >
            {initialsOf(user.name)}
        </span>
    );
}

export function AvatarStack({ users, max = 4, size = 'sm' }: { users: NonNullable<AvatarUser>[]; max?: number; size?: keyof typeof AVATAR_SIZES }) {
    const extra = Math.max(0, users.length - max);
    return (
        <div className="flex -space-x-1.5">
            {users.slice(0, max).map((u, i) => (
                <Avatar key={i} user={u} size={size} />
            ))}
            {extra > 0 && (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 ring-2 ring-white" title={users.slice(max).map((u) => u.name).join(', ')}>
                    +{extra}
                </span>
            )}
        </div>
    );
}

const BADGE_SIZES = { sm: 'px-1.5 py-0.5 text-[11px]', md: 'px-2 py-0.5 text-xs', lg: 'px-2.5 py-1 text-sm' };

export function StatusBadge({ status, size = 'md' }: { status: string | null | undefined; size?: keyof typeof BADGE_SIZES }) {
    const s = TaskStatus.is(status) ? status : null;
    const c = taskStatusColor(s);
    return (
        <span className={cx(`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap bg-${c}-50 text-${c}-700 ring-1 ring-inset ring-${c}-200`, BADGE_SIZES[size])}>
            <span className={`h-1.5 w-1.5 rounded-full bg-${c}-500`} />
            {TaskStatus.label(s)}
        </span>
    );
}

export function PriorityBadge({ priority, showLow = true }: { priority: string | null | undefined; showLow?: boolean }) {
    if (!Priority.is(priority) || (!showLow && priority === 'low')) return null;
    const c = Priority.meta[priority].color;
    return (
        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap bg-${c}-50 text-${c}-700`}>
            <Icon name="flag" className="h-3 w-3" stroke={2} />
            {Priority.label(priority)}
        </span>
    );
}

/** Enhancement / Bug fix / Update — post-launch work on a completed project. */
export function CategoryBadge({ category, className }: { category: string | null | undefined; className?: string }) {
    if (!TaskCategory.is(category)) return null;
    const { color, icon, label } = TaskCategory.meta[category];
    return (
        <span className={cx(`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap bg-${color}-50 text-${color}-700`, className)}>
            <Icon name={icon} className="h-3 w-3" stroke={2} />
            {label}
        </span>
    );
}

/** Marks a standalone task — short-term work that isn't part of a project. */
export function StandaloneBadge({ className }: { className?: string }) {
    return (
        <span className={cx('inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-700', className)} title="Not part of a project">
            <Icon name="bolt" className="h-3 w-3" stroke={2} />
            Standalone
        </span>
    );
}

export function HealthBadge({ health, size = 'md' }: { health: string | null | undefined; size?: keyof typeof BADGE_SIZES }) {
    const h = ProjectHealth.is(health) ? health : null;
    const c = h ? ProjectHealth.meta[h].color : 'slate';
    return (
        <span className={cx(`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap bg-${c}-100 text-${c}-700`, size === 'lg' ? 'px-3 py-1 text-sm' : BADGE_SIZES[size])}>
            <span className={`h-2 w-2 rounded-full bg-${c}-500`} />
            {ProjectHealth.label(h)}
        </span>
    );
}

export function ProjectStatusBadge({ status }: { status: string | null | undefined }) {
    const s = ProjectStatus.is(status) ? status : null;
    const c = s ? ProjectStatus.meta[s].color : 'slate';
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-${c}-50 text-${c}-700 ring-1 ring-inset ring-${c}-200`}>
            {ProjectStatus.label(s)}
        </span>
    );
}

export function DepartmentBadge({ department, size = 'md', short = false, className }: { department: string | null | undefined; size?: keyof typeof BADGE_SIZES; short?: boolean; className?: string }) {
    if (!Department.is(department)) return null;
    const meta = Department.meta[department];
    return (
        <span
            className={cx(`inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap bg-${meta.color}-50 text-${meta.color}-700 ring-1 ring-inset ring-${meta.color}-100`, BADGE_SIZES[size], className)}
            title={meta.label}
        >
            <Icon name={meta.icon} className="h-3 w-3" />
            {short ? meta.code : meta.label}
        </span>
    );
}

function progressColor(value: number): string {
    if (value >= 100) return 'emerald';
    if (value >= 60) return 'indigo';
    if (value > 0) return 'blue';
    return 'slate';
}

const BAR_HEIGHTS = { xs: 'h-1', sm: 'h-1.5', md: 'h-2', lg: 'h-3' };

export function ProgressBar({ value, size = 'md', color, showLabel = false, className }: { value: number; size?: keyof typeof BAR_HEIGHTS; color?: string; showLabel?: boolean; className?: string }) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    const c = color ?? progressColor(v);
    return (
        <div className={cx('flex items-center gap-2', className)}>
            <div className={cx('w-full overflow-hidden rounded-full bg-slate-100', BAR_HEIGHTS[size])} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full rounded-full bg-${c}-500 transition-all duration-500`} style={{ width: `${v}%` }} />
            </div>
            {showLabel && <span className="w-9 shrink-0 text-right text-xs font-medium text-slate-600 tabular-nums">{v}%</span>}
        </div>
    );
}

export function ProgressRing({ value, size = 132, stroke = 10, color, sublabel }: { value: number; size?: number; stroke?: number; color?: string; sublabel?: string }) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    const c = color ?? progressColor(v);
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    return (
        <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${v}% complete`}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    className={`stroke-${c}-500 transition-all duration-700`}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - v / 100)}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                    {v}
                    <span className="text-base text-slate-400">%</span>
                </span>
                {sublabel && <span className="mt-0.5 max-w-[80%] text-[11px] leading-tight text-slate-500">{sublabel}</span>}
            </div>
        </div>
    );
}

const DUE_CLASSES: Record<DueState, string> = {
    overdue: 'text-red-600 font-semibold',
    soon: 'text-amber-600 font-semibold',
    normal: 'text-slate-600',
    closed: 'text-slate-400',
    none: 'text-slate-400',
};

/** Due date with overdue / due-soon colouring (state and labels are computed on the server). */
export function DueDate({ text, state, title }: { text: string | null; state: DueState; title?: string | null }) {
    return (
        <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${DUE_CLASSES[state]}`} title={title ?? undefined}>
            <Icon name={state === 'overdue' ? 'alert' : 'calendar'} className="h-3.5 w-3.5" />
            {text ?? 'No due date'}
        </span>
    );
}

export function StatCard({ label, value, icon = 'chart', color = 'indigo', href, hint }: { label: string; value: number | string; icon?: string; color?: string; href?: string; hint?: string }) {
    const body = (
        <>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-${color}-50 text-${color}-600`}>
                <Icon name={icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
                <div className="text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
                <div className="truncate text-xs font-medium text-slate-500">{label}</div>
                {hint && <div className="truncate text-[11px] text-slate-400">{hint}</div>}
            </div>
        </>
    );
    const className = cx('card group flex items-center gap-4 p-4 transition', href && `hover:border-${color}-200 hover:shadow-md`);
    return href ? (
        <Link href={href} className={className}>
            {body}
        </Link>
    ) : (
        <div className={className}>{body}</div>
    );
}

export function EmptyState({ icon = 'sparkles', title = 'Nothing here yet', description, children, className }: { icon?: string; title?: string; description?: string; children?: ReactNode; className?: string }) {
    return (
        <div className={cx('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Icon name={icon} className="h-6 w-6" />
            </span>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
            {children && <div className="mt-4">{children}</div>}
        </div>
    );
}

export function PageHeader({ title, description, back, meta, actions, className }: { title: string; description?: string; back?: string; meta?: ReactNode; actions?: ReactNode; className?: string }) {
    return (
        <div className={cx('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
            <div className="min-w-0">
                {back && (
                    <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                        <Icon name="arrow-left" className="h-4 w-4" /> Back
                    </Link>
                )}
                <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
                {meta}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

/** Page links for paginated lists (Laravel's ->links()). */
function CompactPagination({ page, lastPage, total, from, to, href }: { page: number; lastPage: number; total: number; from: number; to: number; href: (page: number) => string }) {
    const item = 'inline-flex h-7 w-7 items-center justify-center rounded-lg';
    return (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
            <p className="text-xs text-slate-500 tabular-nums">
                <span className="font-medium text-slate-700">
                    {from}–{to}
                </span>{' '}
                of {total}
            </p>
            <div className="flex items-center gap-1">
                {page > 1 ? (
                    <Link href={href(page - 1)} className={cx(item, 'text-slate-600 hover:bg-slate-100')} aria-label="Previous page">
                        <Icon name="chevron-left" className="h-4 w-4" />
                    </Link>
                ) : (
                    <span className={cx(item, 'text-slate-300')}>
                        <Icon name="chevron-left" className="h-4 w-4" />
                    </span>
                )}
                <span className="px-1 text-xs text-slate-500 tabular-nums">
                    {page} / {lastPage}
                </span>
                {page < lastPage ? (
                    <Link href={href(page + 1)} className={cx(item, 'text-slate-600 hover:bg-slate-100')} aria-label="Next page">
                        <Icon name="chevron-right" className="h-4 w-4" />
                    </Link>
                ) : (
                    <span className={cx(item, 'text-slate-300')}>
                        <Icon name="chevron-right" className="h-4 w-4" />
                    </span>
                )}
            </div>
        </nav>
    );
}

export function Pagination({
    page,
    lastPage,
    total,
    perPage,
    href,
    compact = false,
}: {
    page: number;
    lastPage: number;
    total: number;
    perPage: number;
    href: (page: number) => string;
    /** For narrow cards: "1–6 of 9" and the controls on one line. */
    compact?: boolean;
}) {
    if (lastPage <= 1) return null;
    const from = (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    if (compact) return <CompactPagination page={page} lastPage={lastPage} total={total} from={from} to={to} href={href} />;
    const pages: (number | '…')[] = [];
    for (let p = 1; p <= lastPage; p++) {
        if (p === 1 || p === lastPage || Math.abs(p - page) <= 1) pages.push(p);
        else if (pages.at(-1) !== '…') pages.push('…');
    }
    const item = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm';
    return (
        <nav className="flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="Pagination">
            <p className="text-sm text-slate-500">
                Showing <span className="font-medium text-slate-700">{from}</span> to <span className="font-medium text-slate-700">{to}</span> of{' '}
                <span className="font-medium text-slate-700">{total}</span> results
            </p>
            <div className="flex items-center gap-1">
                {page > 1 ? (
                    <Link href={href(page - 1)} className={cx(item, 'text-slate-600 hover:bg-white')} aria-label="Previous page">
                        <Icon name="chevron-left" className="h-4 w-4" />
                    </Link>
                ) : (
                    <span className={cx(item, 'text-slate-300')}>
                        <Icon name="chevron-left" className="h-4 w-4" />
                    </span>
                )}
                {pages.map((p, i) =>
                    p === '…' ? (
                        <span key={`gap-${i}`} className={cx(item, 'text-slate-400')}>
                            …
                        </span>
                    ) : (
                        <Link
                            key={p}
                            href={href(p)}
                            aria-current={p === page ? 'page' : undefined}
                            className={cx(item, p === page ? 'bg-indigo-600 font-semibold text-white' : 'text-slate-600 hover:bg-white')}
                        >
                            {p}
                        </Link>
                    ),
                )}
                {page < lastPage ? (
                    <Link href={href(page + 1)} className={cx(item, 'text-slate-600 hover:bg-white')} aria-label="Next page">
                        <Icon name="chevron-right" className="h-4 w-4" />
                    </Link>
                ) : (
                    <span className={cx(item, 'text-slate-300')}>
                        <Icon name="chevron-right" className="h-4 w-4" />
                    </span>
                )}
            </div>
        </nav>
    );
}

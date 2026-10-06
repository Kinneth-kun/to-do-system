import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { projectAlive, projectVisibleTo, taskAlive, taskInvolving, taskVisibleTo } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { addDays, addMonths, endOfMonth, endOfWeek, formatDate, isValidDate, startOfMonth, startOfWeek, today } from '@/lib/dates';
import { TaskStatus, taskStatusColor } from '@/lib/enums';
import { usersByIds } from '@/lib/users';
import { withQuery } from '@/lib/urls';
import { buildTaskRows, param, projectChips } from '@/lib/views';
import { Icon } from '@/components/icon';
import { AutoSubmitSelect } from '@/components/client/auto-submit';
import { TaskRow } from '@/components/tasks/task-row';
import { Avatar, cx, EmptyState, PageHeader, ProgressBar } from '@/components/ui';

export const metadata: Metadata = { title: 'Calendar' };

const { tasks } = schema;
type View = 'month' | 'week' | 'day';

/** ?view=month|week|day&date=Y-m-d&project_id=&scope=mine|all */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const params = await searchParams;
    const view: View = (['month', 'week', 'day'] as const).find((v) => v === param(params.view)) ?? 'month';
    const date = isValidDate(param(params.date)) ? param(params.date)! : today();
    const scope = param(params.scope) === 'mine' ? 'mine' : 'all';
    // ?project_id=<id>, or ?project_id=standalone for tasks that aren't in any project.
    const standaloneOnly = param(params.project_id) === 'standalone';
    const projectId = /^\d+$/.test(param(params.project_id) ?? '') ? Number(param(params.project_id)) : null;

    const from = view === 'month' ? startOfWeek(startOfMonth(date)) : view === 'week' ? startOfWeek(date) : date;
    const to = view === 'month' ? endOfWeek(endOfMonth(date)) : view === 'week' ? endOfWeek(date) : date;

    const projects = await db()
        .select({ id: schema.projects.id, name: schema.projects.name })
        .from(schema.projects)
        .where(and(projectAlive, projectVisibleTo(user)))
        .orderBy(asc(schema.projects.name));
    if (projectId && !projects.some((p) => p.id === projectId)) notFound();

    // A task spans [start_date ?? due_date, due_date]; keep those that touch [from, to].
    const rows = await db()
        .select()
        .from(tasks)
        .where(
            and(
                taskAlive,
                taskVisibleTo(user),
                sql`((${tasks.dueDate} is not null and ${tasks.dueDate} >= ${from} and ((${tasks.startDate} is null and ${tasks.dueDate} <= ${to}) or (${tasks.startDate} is not null and ${tasks.startDate} <= ${to})))
                    or (${tasks.dueDate} is null and ${tasks.startDate} is not null and ${tasks.startDate} between ${from} and ${to}))`,
                projectId ? eq(tasks.projectId, projectId) : standaloneOnly ? isNull(tasks.projectId) : undefined,
                scope === 'mine' ? taskInvolving(user.id) : undefined,
            ),
        )
        .orderBy(asc(tasks.dueDate));

    // Month view is keyed on the due date only — showing a task on every day of its range makes
    // the grid unreadable. Week and day views also include work in progress on that day.
    const days: { date: string; tasks: typeof rows }[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
        days.push({
            date: day,
            tasks: rows.filter((t) => t.dueDate === day || (view !== 'month' && t.startDate !== null && t.startDate <= day && (t.dueDate ?? t.startDate) >= day)),
        });
    }

    const day = today();
    const step = (n: number) => (view === 'month' ? addMonths(date, n) : addDays(date, view === 'week' ? 7 * n : n));
    const base = { view, project_id: standaloneOnly ? 'standalone' : projectId, scope: scope === 'mine' ? 'mine' : null };
    const heading =
        view === 'day'
            ? formatDate(date, 'l, F j, Y')
            : view === 'week'
              ? `${formatDate(from, 'M j')} – ${formatDate(to, from.slice(0, 7) === to.slice(0, 7) ? 'j, Y' : 'M j, Y')}`
              : formatDate(date, 'F Y');

    const taskRows = view === 'day' ? await buildTaskRows(user, days[0].tasks) : [];
    const chips = view === 'week' ? await projectChips(rows.map((t) => t.projectId)) : new Map();
    const assignees = view === 'week' ? await usersByIds(rows.map((t) => t.assigneeId).filter((id): id is number => !!id)) : new Map();

    return (
        <>
            <PageHeader
                title="Calendar"
                description="Scheduling and deadlines, driven by task dates."
                actions={
                    <Link href={`/tasks/new?due_date=${date}`} className="btn-primary">
                        <Icon name="plus" className="h-4 w-4" stroke={2} /> New task
                    </Link>
                }
            />

            {/* Toolbar */}
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
                        <Link className="btn-icon h-8 w-8 rounded-r-none" href={withQuery('/calendar', { ...base, date: step(-1) })} aria-label={`Previous ${view}`}>
                            <Icon name="chevron-left" className="h-4 w-4" />
                        </Link>
                        <span className="h-5 w-px bg-slate-200" />
                        <Link className="btn-icon h-8 w-8 rounded-l-none" href={withQuery('/calendar', { ...base, date: step(1) })} aria-label={`Next ${view}`}>
                            <Icon name="chevron-right" className="h-4 w-4" />
                        </Link>
                    </div>
                    <Link className="btn-secondary btn-sm" href={withQuery('/calendar', { ...base, date: day })}>
                        Today
                    </Link>
                    <h2 className="ml-1 text-lg font-semibold tracking-tight text-slate-900">{heading}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                        {(['month', 'week', 'day'] as const).map((v) => (
                            <Link
                                key={v}
                                href={withQuery('/calendar', { ...base, view: v, date })}
                                className={cx('rounded-md px-3 py-1.5 text-xs font-medium capitalize transition', view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}
                            >
                                {v}
                            </Link>
                        ))}
                    </div>
                    <form method="GET" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="view" value={view} />
                        <input type="hidden" name="date" value={date} />
                        <AutoSubmitSelect name="project_id" className="form-select py-1.5 text-xs sm:w-44" defaultValue={standaloneOnly ? 'standalone' : (projectId ?? '')} aria-label="Filter by project">
                            <option value="">All projects</option>
                            <option value="standalone">Standalone tasks</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </AutoSubmitSelect>
                        <AutoSubmitSelect name="scope" className="form-select py-1.5 text-xs sm:w-32" defaultValue={scope} aria-label="Filter by scope">
                            <option value="all">Everyone</option>
                            <option value="mine">My work</option>
                        </AutoSubmitSelect>
                    </form>
                </div>
            </div>

            {view === 'month' && (
                <>
                    {/* Month grid: weekday headers + 7-column grid, agenda list on phones */}
                    <div className="card hidden overflow-hidden md:block">
                        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
                                <div key={w} className="px-3 py-2 text-center text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                                    {w}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7">
                            {days.map((d) => {
                                const isToday = d.date === day;
                                const outside = d.date.slice(0, 7) !== date.slice(0, 7);
                                return (
                                    <div key={d.date} className={cx('group relative min-h-28 border-r border-b border-slate-100 p-2 transition [&:nth-child(7n)]:border-r-0', outside && 'bg-slate-50/60', isToday && 'bg-indigo-50/30')}>
                                        <div className="flex items-center justify-between">
                                            <span
                                                className={cx(
                                                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                                                    isToday ? 'bg-indigo-600 font-semibold text-white' : outside ? 'text-slate-400' : 'text-slate-600',
                                                )}
                                            >
                                                {Number(d.date.slice(8))}
                                            </span>
                                            <Link
                                                href={`/tasks/new?due_date=${d.date}`}
                                                className="rounded p-0.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-white hover:text-indigo-600 focus:opacity-100"
                                                aria-label={`Add a task due ${formatDate(d.date, 'M j')}`}
                                            >
                                                <Icon name="plus" className="h-3.5 w-3.5" stroke={2} />
                                            </Link>
                                        </div>
                                        <div className="mt-1.5 space-y-1">
                                            {d.tasks.slice(0, 3).map((t) => {
                                                const c = taskStatusColor(t.status as TaskStatus);
                                                return (
                                                    <Link
                                                        key={t.id}
                                                        href={`/tasks/${t.id}`}
                                                        className={`block truncate rounded border-l-2 border-${c}-500 bg-${c}-50/70 px-1.5 py-1 text-[11px] leading-tight font-medium text-slate-700 transition hover:bg-${c}-100`}
                                                        title={`${t.title} · ${TaskStatus.label(t.status as TaskStatus)}`}
                                                    >
                                                        <span className={t.status === 'completed' ? 'line-through decoration-slate-400' : ''}>{t.title}</span>
                                                    </Link>
                                                );
                                            })}
                                            {d.tasks.length > 3 && (
                                                <Link href={withQuery('/calendar', { ...base, view: 'day', date: d.date })} className="block px-1.5 text-[11px] font-medium text-slate-500 hover:text-indigo-600">
                                                    +{d.tasks.length - 3} more
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Phone agenda */}
                    <div className="card divide-y divide-slate-100 md:hidden">
                        {days.some((d) => d.tasks.length) ? (
                            days
                                .filter((d) => d.tasks.length)
                                .map((d) => (
                                    <div key={d.date} className="px-4 py-3">
                                        <p className={cx('text-xs font-semibold', d.date === day ? 'text-indigo-600' : 'text-slate-500')}>
                                            {d.date === day ? 'Today · ' : ''}
                                            {formatDate(d.date, 'D, M j')}
                                        </p>
                                        <div className="mt-2 space-y-1.5">
                                            {d.tasks.map((t) => (
                                                <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2">
                                                    <span className={`h-2 w-2 shrink-0 rounded-full bg-${taskStatusColor(t.status as TaskStatus)}-500`} />
                                                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{t.title}</span>
                                                    <span className="shrink-0 text-xs text-slate-400">{t.progress}%</span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                ))
                        ) : (
                            <EmptyState icon="calendar" title="Nothing scheduled" description="No tasks fall in this month." />
                        )}
                    </div>
                </>
            )}

            {view !== 'month' && (
                // Week & day: column / list layout
                <div className={cx('grid gap-4', view === 'week' && 'sm:grid-cols-2 xl:grid-cols-7')}>
                    {days.map((d) => (
                        <section key={d.date} className={cx('card overflow-hidden', d.date === day && 'ring-2 ring-indigo-500/60')}>
                            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                                <h3 className={cx('text-sm font-semibold', d.date === day ? 'text-indigo-600' : 'text-slate-700')}>{view === 'week' ? formatDate(d.date, 'D j') : formatDate(d.date, 'l, F j')}</h3>
                                <span className="text-xs text-slate-400 tabular-nums">{d.tasks.length}</span>
                            </div>
                            {view === 'day' ? (
                                <div className="divide-y divide-slate-100">
                                    {taskRows.length ? (
                                        taskRows.map((t) => <TaskRow key={t.id} task={t} />)
                                    ) : (
                                        <EmptyState icon="calendar" title="Nothing due" description="No tasks are scheduled for this day.">
                                            <Link href={`/tasks/new?due_date=${d.date}`} className="btn-secondary btn-sm">
                                                Add a task
                                            </Link>
                                        </EmptyState>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2 p-3">
                                    {d.tasks.length ? (
                                        d.tasks.map((t) => (
                                            <Link key={t.id} href={`/tasks/${t.id}`} className={`block rounded-lg border-l-2 border-${taskStatusColor(t.status as TaskStatus)}-500 bg-slate-50 p-2 transition hover:bg-slate-100`}>
                                                <p className="line-clamp-2 text-xs font-medium text-slate-700">{t.title}</p>
                                                <p className="mt-1 truncate text-[11px] text-slate-500">{t.projectId ? chips.get(t.projectId)?.name : 'Standalone'}</p>
                                                <div className="mt-1.5 flex items-center gap-1.5">
                                                    <ProgressBar value={t.progress} size="xs" className="flex-1" />
                                                    <Avatar user={t.assigneeId ? assignees.get(t.assigneeId) : null} size="xs" />
                                                </div>
                                            </Link>
                                        ))
                                    ) : (
                                        <p className="px-1 py-3 text-center text-xs text-slate-400">—</p>
                                    )}
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            )}

            {/* Legend */}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="eyebrow">Status</span>
                {TaskStatus.options().map((s) => (
                    <span key={s.value} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <span className={`h-2 w-2 rounded-full bg-${taskStatusColor(s.value as TaskStatus)}-500`} />
                        {s.label}
                    </span>
                ))}
            </div>
        </>
    );
}

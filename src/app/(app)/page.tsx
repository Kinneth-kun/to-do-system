import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { projectAlive, projectVisibleTo, taskAlive, taskInvolving, taskVisibleTo } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { addDays, currentHour, diffForHumans, formatDate, today } from '@/lib/dates';
import { OPEN_STATUSES } from '@/lib/enums';
import { Settings } from '@/lib/settings';
import { firstName, usersByIds } from '@/lib/users';
import { withQuery } from '@/lib/urls';
import { buildTaskRows, lastPage } from '@/lib/views';
import { Icon } from '@/components/icon';
import { TaskRow } from '@/components/tasks/task-row';
import { Avatar, EmptyState, HealthBadge, PageHeader, Pagination, ProgressBar, ProgressRing, StandaloneBadge, StatusBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Dashboard' };

const { tasks, projects, taskUpdates } = schema;
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
const PER_PAGE = 6;

/** A positive page number from ?<key>=, else 1. */
const pageParam = (value: string | string[] | undefined) => {
    const n = Number(Array.isArray(value) ? value[0] : value);
    return Number.isInteger(n) && n > 0 ? n : 1;
};

type FeedEntry = {
    type: string;
    oldStatus: string | null;
    newStatus: string | null;
    oldProgress: number | null;
    newProgress: number | null;
};

/** "moved it to", "updated progress on"… — what an entry in the Latest updates feed did. */
function describeUpdate(u: FeedEntry): { verb: string; status: string | null; progress: number | null } {
    const statusChanged = u.newStatus !== null && u.newStatus !== u.oldStatus;
    const progressChanged = u.newProgress !== null && u.newProgress !== u.oldProgress;
    switch (u.type) {
        case 'created':
            return { verb: 'created', status: null, progress: null };
        case 'remark':
            return { verb: 'added a remark on', status: null, progress: null };
        case 'details':
            return { verb: 'edited', status: null, progress: null };
        case 'assignment':
            return { verb: 'reassigned', status: null, progress: null };
        case 'auto_delayed':
            return { verb: 'is now delayed:', status: null, progress: null };
        case 'undelayed':
            return { verb: 'is back on schedule:', status: null, progress: null };
        default:
            if (statusChanged && u.newStatus === 'completed') return { verb: 'completed', status: null, progress: null };
            return { verb: 'updated', status: statusChanged ? u.newStatus : null, progress: progressChanged ? u.newProgress : null };
    }
}

/** ?page= (Next up), ?updates= (Latest updates) and ?projects= (Projects) page each list independently. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const params = await searchParams;
    const pages = { page: pageParam(params.page), updates: pageParam(params.updates), projects: pageParam(params.projects) };
    // Keep the other lists where they are when one changes page; the anchor keeps the row in view.
    const pageHref = (key: keyof typeof pages) => (n: number) => {
        const next = { ...pages, [key]: n };
        const keep = (value: number) => (value > 1 ? value : null);
        return `${withQuery('/', { page: keep(next.page), updates: keep(next.updates), projects: keep(next.projects) })}#overview-lists`;
    };
    const visible = and(taskAlive, taskVisibleTo(user));
    const day = today();
    const dueSoonDays = await Settings.int('deadline.due_soon_days');

    const recentProjects = await db()
        .select({ id: projects.id, name: projects.name, color: projects.color, health: projects.health, progress: projects.progress })
        .from(projects)
        .where(and(projectAlive, projectVisibleTo(user)))
        .orderBy(desc(projects.createdAt))
        .limit(PER_PAGE)
        .offset((pages.projects - 1) * PER_PAGE);
    const [{ c: projectTotal }] = await db().select({ c: count() }).from(projects).where(and(projectAlive, projectVisibleTo(user)));

    const nextUp = await db()
        .select()
        .from(tasks)
        .where(and(visible, inArray(tasks.status, OPEN_STATUSES)))
        .orderBy(asc(tasks.dueDate), asc(tasks.id))
        .limit(PER_PAGE)
        .offset((pages.page - 1) * PER_PAGE);

    const countWhere = async (condition: ReturnType<typeof and>) => Number((await db().select({ c: count() }).from(tasks).where(and(visible, condition)))[0].c);
    const counts = {
        open: await countWhere(inArray(tasks.status, OPEN_STATUSES)),
        completed: await countWhere(eq(tasks.status, 'completed')),
        delayed: await countWhere(eq(tasks.status, 'delayed')),
        due_soon: await countWhere(
            and(inArray(tasks.status, ['pending', 'in_progress']), isNotNull(tasks.dueDate), sql`${tasks.dueDate} >= ${day}`, sql`${tasks.dueDate} <= ${addDays(day, dueSoonDays)}`, ne(tasks.status, 'delayed')),
        ),
    };
    const rows = await buildTaskRows(user, nextUp);

    // Focus of the Day: your open tasks that are overdue or due today (On Hold excluded).
    const focus = await db()
        .select()
        .from(tasks)
        .where(
            and(
                taskAlive,
                taskInvolving(user.id),
                inArray(tasks.status, ['pending', 'in_progress', 'delayed']),
                or(eq(tasks.status, 'delayed'), and(isNotNull(tasks.dueDate), lte(tasks.dueDate, day))),
            ),
        )
        .orderBy(asc(tasks.dueDate), asc(tasks.id))
        .limit(20);
    const focusRows = await buildTaskRows(user, focus);
    const overdueFocus = focusRows.filter((t) => t.due.state === 'overdue');
    const todayFocus = focusRows.filter((t) => t.due.state !== 'overdue');

    // Plus the open tasks you pinned as priorities (the ☆ on any task), newest pin first.
    const pinned = await db()
        .select({ task: tasks })
        .from(schema.taskFocus)
        .innerJoin(tasks, eq(tasks.id, schema.taskFocus.taskId))
        .where(and(eq(schema.taskFocus.userId, user.id), visible, inArray(tasks.status, ['pending', 'in_progress', 'delayed', 'on_hold'])))
        .orderBy(desc(schema.taskFocus.createdAt))
        .limit(20);
    const alreadyListed = new Set(focusRows.map((t) => t.id));
    const priorityFocus = await buildTaskRows(
        user,
        pinned.map((p) => p.task).filter((t) => !alreadyListed.has(t.id)),
    );
    const focusCount = focusRows.length + priorityFocus.length;

    // Latest updates across the projects and standalone tasks you can see.
    const feed = await db()
        .select({
            id: taskUpdates.id,
            type: taskUpdates.type,
            userId: taskUpdates.userId,
            oldStatus: taskUpdates.oldStatus,
            newStatus: taskUpdates.newStatus,
            oldProgress: taskUpdates.oldProgress,
            newProgress: taskUpdates.newProgress,
            remark: taskUpdates.remark,
            createdAt: taskUpdates.createdAt,
            taskId: tasks.id,
            taskTitle: tasks.title,
            projectId: tasks.projectId,
            projectName: projects.name,
            projectColor: projects.color,
        })
        .from(taskUpdates)
        .innerJoin(tasks, eq(tasks.id, taskUpdates.taskId))
        .leftJoin(projects, eq(projects.id, tasks.projectId))
        .where(and(visible, isNull(projects.deletedAt)))
        .orderBy(desc(taskUpdates.createdAt), desc(taskUpdates.id))
        .limit(PER_PAGE)
        .offset((pages.updates - 1) * PER_PAGE);
    const [{ c: feedTotal }] = await db()
        .select({ c: count() })
        .from(taskUpdates)
        .innerJoin(tasks, eq(tasks.id, taskUpdates.taskId))
        .leftJoin(projects, eq(projects.id, tasks.projectId))
        .where(and(visible, isNull(projects.deletedAt)));
    const feedPeople = await usersByIds(feed.map((f) => f.userId).filter((id): id is number => id !== null));

    const hour = currentHour();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const total = counts.open + counts.completed;
    const completion = total > 0 ? Math.round((counts.completed / total) * 100) : 0;

    const tiles = [
        { label: 'Open work', value: counts.open, icon: 'tasks', color: 'indigo', href: '/tasks?status=in_progress' },
        { label: 'Due soon', value: counts.due_soon, icon: 'clock', color: 'amber', href: '/calendar' },
        { label: 'Delayed', value: counts.delayed, icon: 'alert', color: 'red', href: '/tasks?status=delayed' },
        { label: 'Completed', value: counts.completed, icon: 'check-circle', color: 'emerald', href: '/tasks?status=completed' },
    ];

    return (
        <>
            <PageHeader
                title={`${greeting}, ${firstName(user.name)}`}
                description="Here is the work that needs your attention today."
                actions={
                    <Link className="btn-primary" href="/tasks/new">
                        <Icon name="plus" className="h-4 w-4" stroke={2} /> New task
                    </Link>
                }
            />

            {/* Overview: completion ring + the four counts that matter */}
            <section className="card mb-6 overflow-hidden">
                <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
                    <div className="flex items-center gap-5">
                        <ProgressRing value={completion} size={120} sublabel="completed" />
                        <div className="min-w-0">
                            <p className="eyebrow">Your workload</p>
                            <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                                {counts.open} open {plural(counts.open, 'task')}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                                {counts.delayed > 0
                                    ? `${counts.delayed} delayed ${plural(counts.delayed, 'item')} need attention.`
                                    : counts.due_soon > 0
                                      ? `${counts.due_soon} due in the next few days.`
                                      : "Nothing overdue — you're on track."}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {tiles.map((tile) => (
                            <Link key={tile.label} href={tile.href} className={`group rounded-xl border border-slate-200/80 p-3.5 transition hover:border-${tile.color}-200 hover:bg-${tile.color}-50/40`}>
                                <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-${tile.color}-50 text-${tile.color}-600`}>
                                    <Icon name={tile.icon} className="h-4 w-4" />
                                </span>
                                <span className="mt-3 block text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{tile.value}</span>
                                <span className="mt-0.5 block text-xs font-medium text-slate-500">{tile.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Focus of the Day: your pinned priorities, then overdue and due-today work */}
            <section className="card mb-6 overflow-hidden">
                <div className="card-header flex-wrap gap-3 bg-gradient-to-r from-indigo-50/80 to-white">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
                            <Icon name="fire" className="h-5 w-5" />
                        </span>
                        <div>
                            <h2 className="card-title">Focus of the Day</h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                {formatDate(day, 'l, F j')} ·{' '}
                                {focusCount
                                    ? [
                                          `${focusCount} ${plural(focusCount, 'task')} in focus`,
                                          priorityFocus.length ? `${priorityFocus.length} ${priorityFocus.length === 1 ? 'priority' : 'priorities'}` : null,
                                          overdueFocus.length ? `${overdueFocus.length} overdue` : null,
                                      ]
                                          .filter(Boolean)
                                          .join(', ')
                                    : 'nothing due today'}
                            </p>
                        </div>
                    </div>
                    <Link className="link text-sm" href="/calendar?view=day">
                        Today&apos;s calendar
                    </Link>
                </div>
                {focusCount ? (
                    <div className="divide-y divide-slate-100">
                        {priorityFocus.length > 0 && (
                            <>
                                <p className="flex items-center gap-1.5 bg-indigo-50/60 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-indigo-700 uppercase">
                                    <Icon name="star" className="h-3.5 w-3.5 fill-indigo-400" /> Your priorities
                                </p>
                                {priorityFocus.map((task) => (
                                    <TaskRow key={task.id} task={task} />
                                ))}
                            </>
                        )}
                        {overdueFocus.length > 0 && (
                            <>
                                <p className="bg-red-50/60 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-red-700 uppercase">Overdue — catch up first</p>
                                {overdueFocus.map((task) => (
                                    <TaskRow key={task.id} task={task} />
                                ))}
                            </>
                        )}
                        {todayFocus.length > 0 && (
                            <>
                                <p className="bg-amber-50/60 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-amber-700 uppercase">Due today</p>
                                {todayFocus.map((task) => (
                                    <TaskRow key={task.id} task={task} />
                                ))}
                            </>
                        )}
                    </div>
                ) : (
                    <EmptyState
                        icon="check-circle"
                        title="Nothing due today"
                        description="No overdue or due-today work. Tap the ☆ on any task to make it one of today's priorities."
                    />
                )}
            </section>

            {/* Next up, Latest updates and Projects side by side, each paged on its own. */}
            <div className="grid scroll-mt-20 gap-6 lg:grid-cols-2 xl:grid-cols-3" id="overview-lists">
                <section className="card flex min-w-0 flex-col">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">Next up</h2>
                            <p className="mt-0.5 text-xs text-slate-500">Sorted by due date — update in place.</p>
                        </div>
                        <Link className="link text-sm" href="/tasks">
                            View all
                        </Link>
                    </div>
                    <div className="flex-1 divide-y divide-slate-100">
                        {rows.length ? (
                            rows.map((task) => <TaskRow key={task.id} task={task} />)
                        ) : (
                            <EmptyState icon="check-circle" title="You're all caught up" description="No open tasks are waiting on you right now.">
                                <Link href="/tasks/new" className="btn-secondary btn-sm">
                                    Create a task
                                </Link>
                            </EmptyState>
                        )}
                    </div>
                    {counts.open > PER_PAGE && (
                        <div className="border-t border-slate-100 px-5 py-2.5">
                            <Pagination compact page={pages.page} lastPage={lastPage(counts.open, PER_PAGE)} total={counts.open} perPage={PER_PAGE} href={pageHref('page')} />
                        </div>
                    )}
                </section>

                <section className="card flex min-w-0 flex-col">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">Latest updates</h2>
                            <p className="mt-0.5 text-xs text-slate-500">Projects and standalone tasks</p>
                        </div>
                    </div>
                    {feed.length ? (
                        <ul className="flex-1 divide-y divide-slate-100">
                            {feed.map((entry) => {
                                const person = entry.userId ? feedPeople.get(entry.userId) : null;
                                const what = describeUpdate(entry);
                                return (
                                    <li key={entry.id}>
                                        <Link href={`/tasks/${entry.taskId}`} className="flex gap-3 px-5 py-3 transition hover:bg-slate-50">
                                            {person ? (
                                                <Avatar user={person} size="sm" />
                                            ) : (
                                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                                    <Icon name="refresh" className="h-3.5 w-3.5" />
                                                </span>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-slate-700">
                                                    <span className="font-medium text-slate-900">{person ? firstName(person.name) : 'TaskFlow'}</span> {what.verb}{' '}
                                                    <span className="font-medium text-slate-900">{entry.taskTitle}</span>
                                                </p>
                                                {(what.status || what.progress !== null) && (
                                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                        {what.status && <StatusBadge status={what.status} size="sm" />}
                                                        {what.progress !== null && <span className="chip bg-slate-100 text-slate-600 tabular-nums">{what.progress}%</span>}
                                                    </div>
                                                )}
                                                {entry.remark && <p className="mt-1 line-clamp-2 text-xs text-slate-500 italic">“{entry.remark}”</p>}
                                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                                                    {entry.projectName ? (
                                                        <span className="inline-flex max-w-[11rem] items-center gap-1.5 truncate text-slate-500">
                                                            <span className={`h-2 w-2 shrink-0 rounded-sm bg-${entry.projectColor}-500`} />
                                                            {entry.projectName}
                                                        </span>
                                                    ) : (
                                                        <StandaloneBadge />
                                                    )}
                                                    <time dateTime={entry.createdAt.toISOString()} title={formatDate(entry.createdAt, 'M j, Y g:i A')}>
                                                        {diffForHumans(entry.createdAt)}
                                                    </time>
                                                </div>
                                            </div>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <EmptyState icon="history" title="No updates yet" description="Progress updates and remarks on your projects and tasks will show here." />
                    )}
                    {Number(feedTotal) > PER_PAGE && (
                        <div className="border-t border-slate-100 px-5 py-2.5">
                            <Pagination compact page={pages.updates} lastPage={lastPage(Number(feedTotal), PER_PAGE)} total={Number(feedTotal)} perPage={PER_PAGE} href={pageHref('updates')} />
                        </div>
                    )}
                </section>

                <section className="card flex min-w-0 flex-col">
                    <div className="card-header">
                        <h2 className="card-title">Projects</h2>
                        <Link className="link text-sm" href="/projects">
                            View all
                        </Link>
                    </div>
                    <div className="flex-1 divide-y divide-slate-100">
                        {recentProjects.length ? (
                            recentProjects.map((project) => (
                                <Link key={project.id} className="block px-5 py-3.5 transition hover:bg-slate-50" href={`/projects/${project.id}`}>
                                    <div className="flex items-center gap-2">
                                        <span className={`h-2 w-2 shrink-0 rounded-sm bg-${project.color}-500`} />
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{project.name}</span>
                                        <HealthBadge health={project.health} size="sm" />
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-3">
                                        <ProgressBar value={project.progress} size="xs" className="flex-1" />
                                        <span className="w-9 text-right text-xs font-medium text-slate-500 tabular-nums">{project.progress}%</span>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <EmptyState icon="folder" title="No projects yet" description="Projects group related tasks together.">
                                <Link href="/projects/new" className="btn-secondary btn-sm">
                                    Create a project
                                </Link>
                            </EmptyState>
                        )}
                    </div>
                    {Number(projectTotal) > PER_PAGE && (
                        <div className="border-t border-slate-100 px-5 py-2.5">
                            <Pagination compact page={pages.projects} lastPage={lastPage(Number(projectTotal), PER_PAGE)} total={Number(projectTotal)} perPage={PER_PAGE} href={pageHref('projects')} />
                        </div>
                    )}
                </section>
            </div>
        </>
    );
}

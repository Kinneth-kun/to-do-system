import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { formatDate, now, today } from '@/lib/dates';
import { Department, OPEN_STATUSES, ProjectHealth, type TaskStatus, taskStatusColor } from '@/lib/enums';
import { Settings } from '@/lib/settings';
import { dueLabel, isDueSoon, isOverdue } from '@/lib/task-utils';
import { withQuery } from '@/lib/urls';
import { usersByIds } from '@/lib/users';
import { param } from '@/lib/views';
import { Icon } from '@/components/icon';
import { FullscreenButton } from '@/components/client/fullscreen-button';

export const metadata: Metadata = { title: 'Meeting Mode' };

/**
 * Presentation view for review meetings: no sidebar, large type, dark background.
 * ?department=<value> narrows the review to one department, so each team can be walked through in
 * turn: tasks assigned to its people, and the active projects those tasks belong to.
 */
export default async function MeetingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    // Administrators only — executives have the dashboard but not Meeting Mode.
    await requireAdmin();
    const params = await searchParams;
    const department = Department.is(param(params.department)) ? (param(params.department) as Department) : null;
    const taskInDepartment = department ? sql`exists (select 1 from users u where u.id = ${schema.tasks.assigneeId} and u.department = ${department})` : undefined;
    const projectInDepartment = department
        ? sql`exists (select 1 from tasks t join users u on u.id = t.assignee_id where t.project_id = ${schema.projects.id} and t.deleted_at is null and u.department = ${department})`
        : undefined;

    const organization = await Settings.string('general.organization');
    const dueSoonDays = await Settings.int('deadline.due_soon_days');
    const day = today();

    const projects = await db()
        .select()
        .from(schema.projects)
        .where(and(isNull(schema.projects.deletedAt), eq(schema.projects.status, 'active'), projectInDepartment))
        .orderBy(asc(schema.projects.dueDate));
    const tasks = await db()
        .select({ task: schema.tasks, projectName: schema.projects.name })
        .from(schema.tasks)
        // Standalone tasks (no project) are part of the portfolio's open work too.
        .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
        .where(and(isNull(schema.tasks.deletedAt), isNull(schema.projects.deletedAt), inArray(schema.tasks.status, OPEN_STATUSES), taskInDepartment))
        .orderBy(sql`${schema.tasks.dueDate} is null`, asc(schema.tasks.dueDate))
        .limit(25);
    const people = await usersByIds([...projects.map((p) => p.ownerId), ...tasks.map((t) => t.task.assigneeId).filter((id): id is number => !!id)]);

    const needsAttention = tasks.filter(({ task }) => task.status === 'delayed' || isOverdue(task, day) || isDueSoon(task, day, dueSoonDays));
    const attentionIds = new Set(needsAttention.map(({ task }) => task.id));
    const upcoming = tasks.filter(({ task }) => !attentionIds.has(task.id)).slice(0, 8);

    // Open tasks per department (by assignee), for the filter tabs.
    const openByDepartment = new Map(
        (
            await db()
                .select({ department: schema.users.department, open: sql<number>`count(*)::int` })
                .from(schema.tasks)
                .innerJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
                .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
                .where(and(isNull(schema.tasks.deletedAt), isNull(schema.projects.deletedAt), inArray(schema.tasks.status, OPEN_STATUSES)))
                .groupBy(schema.users.department)
        ).map((r) => [r.department, Number(r.open)]),
    );
    const openTotal = [...openByDepartment.values()].reduce((a, b) => a + b, 0);
    const tab = (on: boolean) =>
        `inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${on ? 'bg-white text-slate-900' : 'border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'}`;
    const count = (on: boolean) => `rounded-full px-1.5 text-xs tabular-nums ${on ? 'bg-slate-900/10 text-slate-700' : 'bg-white/10 text-slate-400'}`;

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/90 backdrop-blur print:hidden">
                <div className="mx-auto flex max-w-[110rem] flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-10">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
                            <Icon name="presentation" className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-xs font-medium tracking-wide text-indigo-300 uppercase">{organization}</p>
                            <h1 className="text-lg font-semibold tracking-tight">Project review{department && <span className="text-slate-400"> · {Department.label(department)}</span>}</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="hidden text-sm text-slate-400 sm:inline">{formatDate(now(), 'l, F j, Y')}</span>
                        <FullscreenButton />
                        <Link href={withQuery('/admin/executive', { department })} className="btn btn-sm border border-white/15 text-slate-200 hover:bg-white/10">
                            Exit
                        </Link>
                    </div>
                </div>
                {/* Department filter: walk the meeting through one team at a time. */}
                <nav aria-label="Filter by department" className="mx-auto max-w-[110rem] overflow-x-auto px-6 pb-3 sm:px-10">
                    <div className="flex min-w-max items-center gap-2">
                        <Link href="/admin/meeting" scroll={false} className={tab(!department)} aria-current={!department ? 'page' : undefined}>
                            All departments <span className={count(!department)}>{openTotal}</span>
                        </Link>
                        {Department.values.map((d) => {
                            const on = d === department;
                            return (
                                <Link key={d} href={withQuery('/admin/meeting', { department: d })} scroll={false} className={tab(on)} aria-current={on ? 'page' : undefined}>
                                    <span className={`h-2 w-2 rounded-full bg-${Department.meta[d].color}-400`} />
                                    {Department.label(d)}
                                    <span className={count(on)}>{openByDepartment.get(d) ?? 0}</span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>
            </header>

            <main className="mx-auto max-w-[110rem] space-y-12 px-6 py-10 sm:px-10">
                {/* 1. Project overview */}
                <section>
                    <div className="mb-5 flex items-baseline gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">1</span>
                        <h2 className="text-2xl font-semibold tracking-tight">Project overview</h2>
                        <span className="text-sm text-slate-500">{projects.length} active</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {projects.length ? (
                            projects.map((p) => {
                                const c = ProjectHealth.meta[p.health as ProjectHealth]?.color ?? 'slate';
                                return (
                                    <article key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:bg-white/[0.07]">
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{p.name}</h3>
                                            <span className={`chip shrink-0 bg-${c}-500/15 text-${c}-300`}>
                                                <span className={`h-1.5 w-1.5 rounded-full bg-${c}-400`} />
                                                {ProjectHealth.label(p.health as ProjectHealth)}
                                            </span>
                                        </div>
                                        <p className="mt-1 truncate text-sm text-slate-400">{people.get(p.ownerId)?.name}</p>
                                        <div className="mt-5 flex items-end justify-between gap-3">
                                            <span className="text-3xl font-semibold tracking-tight tabular-nums">
                                                {p.progress}
                                                <span className="text-lg text-slate-500">%</span>
                                            </span>
                                            <span className="pb-1 text-xs text-slate-400">{p.dueDate ? `Due ${formatDate(p.dueDate, 'M j, Y')}` : 'No due date'}</span>
                                        </div>
                                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                                            <div className={`h-full rounded-full bg-${c}-400 transition-all duration-700`} style={{ width: `${p.progress}%` }} />
                                        </div>
                                    </article>
                                );
                            })
                        ) : (
                            <p className="text-slate-400">{department ? `No active projects with ${Department.label(department)} work.` : 'No active projects.'}</p>
                        )}
                    </div>
                </section>

                {/* 2. Needs attention */}
                <section>
                    <div className="mb-5 flex items-baseline gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 text-sm font-semibold text-red-300">2</span>
                        <h2 className="text-2xl font-semibold tracking-tight">Needs attention</h2>
                        <span className="text-sm text-slate-500">
                            {needsAttention.length} {needsAttention.length === 1 ? 'item' : 'items'}
                        </span>
                    </div>
                    {needsAttention.length === 0 ? (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
                            <Icon name="check-circle" className="mx-auto h-8 w-8 text-emerald-400" />
                            <p className="mt-3 text-lg font-medium text-emerald-200">Nothing needs attention</p>
                            <p className="mt-1 text-sm text-slate-400">{department ? `No delayed or imminent work in ${Department.label(department)}.` : 'No delayed or imminent work across the portfolio.'}</p>
                        </div>
                    ) : (
                        <div className="grid gap-3 lg:grid-cols-2">
                            {needsAttention.map(({ task, projectName }) => {
                                const late = isOverdue(task, day) || task.status === 'delayed';
                                return (
                                    <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.08]">
                                        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-${taskStatusColor(task.status as TaskStatus)}-400`} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-base font-medium">{task.title}</p>
                                            <p className="mt-0.5 truncate text-sm text-slate-400">
                                                {projectName ?? 'Standalone'} · {task.assigneeId ? people.get(task.assigneeId)?.name : 'Unassigned'}
                                            </p>
                                            {task.latestRemark && <p className="mt-2 line-clamp-2 text-sm text-slate-300 italic">“{task.latestRemark}”</p>}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className={`text-sm font-semibold ${late ? 'text-red-300' : 'text-amber-300'}`}>{dueLabel(task.dueDate, day) ?? '—'}</p>
                                            <p className="mt-1 text-xs text-slate-500 tabular-nums">{task.progress}%</p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* 3. Upcoming work */}
                <section>
                    <div className="mb-5 flex items-baseline gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">3</span>
                        <h2 className="text-2xl font-semibold tracking-tight">Upcoming work</h2>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-white/10">
                        {upcoming.length ? (
                            upcoming.map(({ task, projectName }) => (
                                <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center gap-4 border-b border-white/5 bg-white/[0.02] px-5 py-3.5 transition last:border-0 hover:bg-white/[0.06]">
                                    <span className={`h-2 w-2 shrink-0 rounded-full bg-${taskStatusColor(task.status as TaskStatus)}-400`} />
                                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                                    <span className="hidden w-48 truncate text-sm text-slate-400 sm:block">{projectName ?? 'Standalone'}</span>
                                    <span className="hidden w-40 truncate text-sm text-slate-400 md:block">{task.assigneeId ? people.get(task.assigneeId)?.name : 'Unassigned'}</span>
                                    <span className="w-24 shrink-0 text-right text-sm text-slate-400">{task.dueDate ? formatDate(task.dueDate, 'M j') : '—'}</span>
                                </Link>
                            ))
                        ) : (
                            <p className="bg-white/[0.02] px-5 py-8 text-center text-slate-400">No open work scheduled.</p>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}

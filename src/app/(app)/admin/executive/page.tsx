import type { Metadata } from 'next';
import Link from 'next/link';
import { and, avg, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { requireFullAccess } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { formatDate, now, today } from '@/lib/dates';
import { Department, OPEN_STATUSES, ProjectHealth, TaskStatus, taskStatusColor } from '@/lib/enums';
import { ProjectHealthService } from '@/lib/services/health';
import { Settings } from '@/lib/settings';
import { isProjectOverdue } from '@/lib/task-utils';
import { usersByIds } from '@/lib/users';
import { Icon } from '@/components/icon';
import { ClickableRow } from '@/components/client/clickable-row';
import { Avatar, cx, DepartmentBadge, EmptyState, HealthBadge, PageHeader, ProgressBar, ProgressRing, StatCard } from '@/components/ui';

export const metadata: Metadata = { title: 'Executive Dashboard' };

const { tasks, projects, users } = schema;
const liveTask = isNull(tasks.deletedAt);
const liveProject = isNull(projects.deletedAt);

export default async function ExecutiveDashboardPage() {
    const user = await requireFullAccess();

    // The eight most recently updated projects, with health recalculated so the table is current.
    const recent = await db().select({ id: projects.id }).from(projects).where(liveProject).orderBy(desc(projects.updatedAt)).limit(8);
    const portfolio = [];
    for (const { id } of recent) portfolio.push((await ProjectHealthService.refresh(id))!);
    portfolio.sort((a, b) => ProjectHealth.meta[a.health as ProjectHealth].urgency - ProjectHealth.meta[b.health as ProjectHealth].urgency);
    const owners = await usersByIds(portfolio.map((p) => p.ownerId));

    const single = async (query: Promise<{ c: number }[]>) => Number((await query)[0].c);
    const stats = {
        users: await single(db().select({ c: count() }).from(users).where(eq(users.isActive, true))),
        projects: await single(db().select({ c: count() }).from(projects).where(and(liveProject, eq(projects.status, 'active')))),
        tasks: await single(db().select({ c: count() }).from(tasks).where(liveTask)),
        completed: await single(db().select({ c: count() }).from(tasks).where(and(liveTask, eq(tasks.status, 'completed')))),
        delayed: await single(db().select({ c: count() }).from(tasks).where(and(liveTask, eq(tasks.status, 'delayed')))),
    };

    const statusCounts = new Map((await db().select({ status: tasks.status, c: count() }).from(tasks).where(liveTask).groupBy(tasks.status)).map((r) => [r.status, Number(r.c)]));
    const taskTotal = Math.max(1, [...statusCounts.values()].reduce((a, b) => a + b, 0));
    const healthCounts = new Map((await db().select({ health: projects.health, c: count() }).from(projects).where(liveProject).groupBy(projects.health)).map((r) => [r.health, Number(r.c)]));
    const [{ overall }] = await db()
        .select({ overall: avg(projects.progress) })
        .from(projects)
        .where(and(liveProject, eq(projects.status, 'active')));

    // Work by department: open tasks counted against the department of the person assigned.
    const byDepartment = new Map(
        (
            await db()
                .select({
                    department: users.department,
                    people: sql<number>`count(distinct ${users.id})::int`,
                    open: sql<number>`count(${tasks.id}) filter (where ${inArray(tasks.status, OPEN_STATUSES)})::int`,
                    delayed: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'delayed')::int`,
                    completed: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'completed')::int`,
                })
                .from(users)
                .leftJoin(tasks, and(eq(tasks.assigneeId, users.id), liveTask))
                .where(isNotNull(users.department))
                .groupBy(users.department)
        ).map((r) => [r.department, r]),
    );
    const maxOpen = Math.max(1, ...[...byDepartment.values()].map((r) => r.open));
    const organization = await Settings.string('general.organization');
    const day = today();

    return (
        <>
            <PageHeader
                title="Executive Dashboard"
                description={`${organization} · ${formatDate(now(), 'l, F j, Y')}`}
                actions={
                    user.isAdmin && (
                        <Link href="/admin/meeting" className="btn-primary">
                            <Icon name="presentation" className="h-4 w-4" /> Meeting mode
                        </Link>
                    )
                }
            />

            {/* KPI row */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Active projects" value={stats.projects} icon="folder" color="indigo" href="/projects?status=active" />
                <StatCard label="Total tasks" value={stats.tasks} icon="tasks" color="violet" href="/tasks" />
                <StatCard label="Completed" value={stats.completed} icon="check-circle" color="emerald" href="/tasks?status=completed" />
                <StatCard label="Delayed" value={stats.delayed} icon="alert" color="red" href="/tasks?status=delayed" />
                <StatCard label="Active people" value={stats.users} icon="users" color="sky" href={user.isAdmin ? '/admin/users' : undefined} />
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
                <section className="card">
                    <div className="card-header">
                        <h2 className="card-title">Portfolio health</h2>
                    </div>
                    <div className="card-body">
                        <div className="flex items-center gap-5">
                            <ProgressRing value={Math.round(Number(overall ?? 0))} size={104} sublabel="avg progress" />
                            <ul className="min-w-0 flex-1 space-y-2">
                                {ProjectHealth.values.map((h) => (
                                    <li key={h} className="flex items-center gap-2 text-sm">
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full bg-${ProjectHealth.meta[h].color}-500`} />
                                        <span className="min-w-0 flex-1 truncate text-slate-600">{ProjectHealth.label(h)}</span>
                                        <span className="font-semibold text-slate-900 tabular-nums">{healthCounts.get(h) ?? 0}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="card">
                    <div className="card-header">
                        <h2 className="card-title">Task distribution</h2>
                        <span className="text-xs text-slate-500">{stats.tasks} tasks</span>
                    </div>
                    <div className="card-body">
                        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                            {TaskStatus.values.map((s) =>
                                statusCounts.get(s) ? (
                                    <div
                                        key={s}
                                        className={`bg-${taskStatusColor(s)}-500 transition-all`}
                                        style={{ width: `${Math.round(((statusCounts.get(s) ?? 0) / taskTotal) * 1000) / 10}%` }}
                                        title={`${TaskStatus.label(s)}: ${statusCounts.get(s)}`}
                                    />
                                ) : null,
                            )}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                            {TaskStatus.values.map((s) => (
                                <div key={s} className="flex items-center gap-2 text-sm">
                                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full bg-${taskStatusColor(s)}-500`} />
                                    <span className="min-w-0 flex-1 truncate text-slate-600">{TaskStatus.label(s)}</span>
                                    <span className="font-semibold text-slate-900 tabular-nums">{statusCounts.get(s) ?? 0}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>

            {/* Work by department: who owns what, and where the delays sit */}
            <section className="card mb-6">
                <div className="card-header">
                    <div>
                        <h2 className="card-title">Work by department</h2>
                        <p className="mt-0.5 text-xs text-slate-500">Open tasks counted against the department of the person assigned.</p>
                    </div>
                </div>
                <div className="divide-y divide-slate-100">
                    {Department.values.map((dept) => {
                        const row = byDepartment.get(dept) ?? { people: 0, open: 0, delayed: 0, completed: 0 };
                        return (
                            <Link key={dept} href={`/tasks?department=${dept}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition hover:bg-slate-50">
                                <span className="w-full sm:w-52">
                                    <DepartmentBadge department={dept} />
                                </span>
                                <span className="hidden w-20 text-xs text-slate-500 sm:inline">
                                    {row.people} {row.people === 1 ? 'person' : 'people'}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                                        <span className={`bg-${Department.meta[dept].color}-500`} style={{ width: `${Math.round((row.open / maxOpen) * 100)}%` }} />
                                    </span>
                                </span>
                                <span className="flex items-center gap-4 text-xs tabular-nums">
                                    <span className="text-slate-600">
                                        <span className="font-semibold text-slate-900">{row.open}</span> open
                                    </span>
                                    <span className={row.delayed > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{row.delayed} delayed</span>
                                    <span className="hidden text-slate-500 sm:inline">{row.completed} done</span>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </section>

            {/* Portfolio table */}
            <section className="card overflow-hidden">
                <div className="card-header">
                    <h2 className="card-title">Project portfolio</h2>
                    <Link className="link text-sm" href="/projects">
                        All projects
                    </Link>
                </div>
                {portfolio.length === 0 ? (
                    <EmptyState icon="folder" title="No projects yet" description="Delivery health will appear here once projects exist." />
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Project</th>
                                        <th>Health</th>
                                        <th className="w-48">Progress</th>
                                        <th>Owner</th>
                                        <th>Due</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {portfolio.map((p) => (
                                        <ClickableRow key={p.id} href={`/projects/${p.id}`}>
                                            <td>
                                                <div className="flex items-center gap-2.5">
                                                    <span className={`h-2.5 w-2.5 shrink-0 rounded-sm bg-${p.color}-500`} />
                                                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900">
                                                        {p.name}
                                                    </Link>
                                                </div>
                                            </td>
                                            <td>
                                                <HealthBadge health={p.health} size="sm" />
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <ProgressBar value={p.progress} size="sm" className="w-28" />
                                                    <span className="text-xs font-medium text-slate-600 tabular-nums">{p.progress}%</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="inline-flex items-center gap-2">
                                                    <Avatar user={owners.get(p.ownerId)} size="xs" />
                                                    <span className="text-sm text-slate-600">{owners.get(p.ownerId)?.name}</span>
                                                </span>
                                            </td>
                                            <td>
                                                {p.dueDate ? (
                                                    <span className={cx('text-sm whitespace-nowrap', isProjectOverdue(p, day) ? 'font-semibold text-red-600' : 'text-slate-600')}>{formatDate(p.dueDate, 'M j, Y')}</span>
                                                ) : (
                                                    <span className="text-sm text-slate-400">—</span>
                                                )}
                                            </td>
                                        </ClickableRow>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="divide-y divide-slate-100 md:hidden">
                            {portfolio.map((p) => (
                                <Link key={p.id} href={`/projects/${p.id}`} className="block px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm bg-${p.color}-500`} />
                                        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{p.name}</span>
                                        <HealthBadge health={p.health} size="sm" />
                                    </div>
                                    <div className="mt-2 flex items-center gap-3">
                                        <ProgressBar value={p.progress} size="sm" className="flex-1" />
                                        <span className="text-xs text-slate-500 tabular-nums">{p.progress}%</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </section>
        </>
    );
}

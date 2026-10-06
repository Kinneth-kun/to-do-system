import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { projectAlive, projectVisibleTo, taskAlive, taskVisibleTo } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { addDays, currentHour, today } from '@/lib/dates';
import { OPEN_STATUSES } from '@/lib/enums';
import { Settings } from '@/lib/settings';
import { firstName } from '@/lib/users';
import { buildTaskRows } from '@/lib/views';
import { Icon } from '@/components/icon';
import { TaskRow } from '@/components/tasks/task-row';
import { EmptyState, HealthBadge, PageHeader, ProgressBar, ProgressRing } from '@/components/ui';

export const metadata: Metadata = { title: 'Dashboard' };

const { tasks, projects } = schema;
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

export default async function DashboardPage() {
    const user = await requireUser();
    const visible = and(taskAlive, taskVisibleTo(user));
    const day = today();
    const dueSoonDays = await Settings.int('deadline.due_soon_days');

    const recentProjects = await db()
        .select({ id: projects.id, name: projects.name, color: projects.color, health: projects.health, progress: projects.progress })
        .from(projects)
        .where(and(projectAlive, projectVisibleTo(user)))
        .orderBy(desc(projects.createdAt))
        .limit(6);

    const nextUp = await db()
        .select()
        .from(tasks)
        .where(and(visible, inArray(tasks.status, OPEN_STATUSES)))
        .orderBy(asc(tasks.dueDate))
        .limit(8);

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

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
                <section className="card self-start">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">Next up</h2>
                            <p className="mt-0.5 text-xs text-slate-500">Sorted by due date — update without leaving this page.</p>
                        </div>
                        <Link className="link text-sm" href="/tasks">
                            View all
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100">
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
                </section>

                <section className="card self-start">
                    <div className="card-header">
                        <h2 className="card-title">Projects</h2>
                        <Link className="link text-sm" href="/projects">
                            View all
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100">
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
                </section>
            </div>
        </>
    );
}

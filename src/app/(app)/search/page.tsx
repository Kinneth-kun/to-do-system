import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, desc, eq, or } from 'drizzle-orm';
import { projectAlive, projectVisibleTo, taskAlive, taskVisibleTo } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { contains } from '@/lib/search';
import { userLiteColumns, type UserLite } from '@/lib/users';
import { buildTaskRows, param } from '@/lib/views';
import { Icon } from '@/components/icon';
import { TaskRow } from '@/components/tasks/task-row';
import { Avatar, DepartmentBadge, EmptyState, HealthBadge, PageHeader, ProgressBar } from '@/components/ui';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const q = param((await searchParams).q)?.trim().slice(0, 100) ?? '';

    let projects: { id: number; name: string; color: string; health: string; progress: number }[] = [];
    let taskRows: Awaited<ReturnType<typeof buildTaskRows>> = [];
    let people: UserLite[] = [];

    if (q) {
        projects = await db()
            .select({ id: schema.projects.id, name: schema.projects.name, color: schema.projects.color, health: schema.projects.health, progress: schema.projects.progress })
            .from(schema.projects)
            .where(and(projectAlive, projectVisibleTo(user), contains(schema.projects.name, q)))
            .orderBy(desc(schema.projects.createdAt))
            .limit(20);
        const tasks = await db()
            .select()
            .from(schema.tasks)
            .where(and(taskAlive, taskVisibleTo(user), contains(schema.tasks.title, q)))
            .orderBy(desc(schema.tasks.createdAt))
            .limit(30);
        taskRows = await buildTaskRows(user, tasks);
        people = (await db()
            .select(userLiteColumns)
            .from(schema.users)
            .where(and(eq(schema.users.isActive, true), or(contains(schema.users.name, q), contains(schema.users.username, q))))
            .orderBy(asc(schema.users.name))
            .limit(20)) as UserLite[];
    }

    const total = projects.length + taskRows.length + people.length;

    return (
        <>
            <PageHeader title="Search" description={q ? `${total} ${total === 1 ? 'result' : 'results'} for “${q}”` : 'Find projects, tasks and people across your workspace.'} />

            <form method="GET" action="/search" className="mb-6">
                <div className="relative">
                    <Icon name="search" className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input className="form-input py-3 pr-28 pl-11 text-base" name="q" defaultValue={q} placeholder="Search everything…" autoFocus required minLength={2} />
                    <button className="btn-primary absolute top-1/2 right-2 -translate-y-1/2" type="submit">
                        Search
                    </button>
                </div>
            </form>

            {!q ? (
                <div className="card">
                    <EmptyState icon="search" title="Start typing to search" description="Look for a project name, a task title, or a teammate's name or @username." />
                </div>
            ) : total === 0 ? (
                <div className="card">
                    <EmptyState icon="search" title={`No results for “${q}”`} description="Check the spelling or try a shorter, more general term." />
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <section className="card min-w-0 self-start">
                        <div className="card-header">
                            <h2 className="card-title">Tasks</h2>
                            <span className="chip bg-slate-100 text-slate-600">{taskRows.length}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {taskRows.length ? taskRows.map((t) => <TaskRow key={t.id} task={t} />) : <p className="px-5 py-6 text-center text-sm text-slate-500">No matching tasks.</p>}
                        </div>
                    </section>

                    <div className="space-y-6">
                        <section className="card self-start">
                            <div className="card-header">
                                <h2 className="card-title">Projects</h2>
                                <span className="chip bg-slate-100 text-slate-600">{projects.length}</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {projects.length ? (
                                    projects.map((p) => (
                                        <Link key={p.id} className="block px-5 py-3 transition hover:bg-slate-50" href={`/projects/${p.id}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`h-2 w-2 shrink-0 rounded-sm bg-${p.color}-500`} />
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{p.name}</span>
                                                <HealthBadge health={p.health} size="sm" />
                                            </div>
                                            <div className="mt-2 flex items-center gap-2">
                                                <ProgressBar value={p.progress} size="xs" className="flex-1" />
                                                <span className="text-xs text-slate-500 tabular-nums">{p.progress}%</span>
                                            </div>
                                        </Link>
                                    ))
                                ) : (
                                    <p className="px-5 py-6 text-center text-sm text-slate-500">No matching projects.</p>
                                )}
                            </div>
                        </section>

                        <section className="card self-start">
                            <div className="card-header">
                                <h2 className="card-title">People</h2>
                                <span className="chip bg-slate-100 text-slate-600">{people.length}</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {people.length ? (
                                    people.map((p) => (
                                        <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                                            <Avatar user={p} size="sm" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                                                <p className="truncate text-xs text-slate-500">{p.jobTitle || p.username}</p>
                                                {p.department && <DepartmentBadge department={p.department} size="sm" className="mt-1" />}
                                            </div>
                                            {user.isAdmin && (
                                                <Link href={`/admin/users/${p.id}/edit`} className="btn-ghost btn-sm">
                                                    Manage
                                                </Link>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p className="px-5 py-6 text-center text-sm text-slate-500">No matching people.</p>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </>
    );
}

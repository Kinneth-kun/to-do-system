import type { Metadata } from 'next';
import Link from 'next/link';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { projectAlive, projectVisibleTo } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { formatDate, today } from '@/lib/dates';
import { ProjectStatus } from '@/lib/enums';
import { contains } from '@/lib/search';
import { isProjectOverdue } from '@/lib/task-utils';
import { withQuery } from '@/lib/urls';
import { userLiteColumns, type UserLite } from '@/lib/users';
import { lastPage, paging, param } from '@/lib/views';
import { Icon } from '@/components/icon';
import { AvatarStack, cx, EmptyState, HealthBadge, PageHeader, Pagination, ProgressBar, ProjectStatusBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Projects' };

const PER_PAGE = 15;
const { projects } = schema;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const params = await searchParams;
    const q = param(params.q)?.trim().slice(0, 100) || '';
    const status = ProjectStatus.is(param(params.status)) ? param(params.status)! : '';

    const where = and(projectAlive, projectVisibleTo(user), q ? contains(projects.name, q) : undefined, status ? eq(projects.status, status) : undefined);
    const { page, offset } = paging(params, PER_PAGE);
    const [{ total }] = await db().select({ total: count() }).from(projects).where(where);
    const rows = await db().select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(PER_PAGE).offset(offset);

    const ids = rows.map((p) => p.id);
    const members = new Map<number, UserLite[]>();
    const taskCounts = new Map<number, number>();
    if (ids.length) {
        const memberRows = await db()
            .select({ projectId: schema.projectMembers.projectId, ...userLiteColumns })
            .from(schema.projectMembers)
            .innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
            .where(inArray(schema.projectMembers.projectId, ids))
            .orderBy(schema.projectMembers.createdAt);
        for (const { projectId, ...u } of memberRows) members.set(projectId, [...(members.get(projectId) ?? []), u as UserLite]);

        const countRows = await db()
            .select({ projectId: schema.tasks.projectId, c: count() })
            .from(schema.tasks)
            .where(and(inArray(schema.tasks.projectId, ids), isNull(schema.tasks.deletedAt)))
            .groupBy(schema.tasks.projectId);
        for (const r of countRows) taskCounts.set(r.projectId!, Number(r.c));
    }
    const day = today();

    return (
        <>
            <PageHeader
                title="Projects"
                description="Workspaces you own or collaborate on."
                actions={
                    <Link href="/projects/new" className="btn-primary">
                        <Icon name="plus" className="h-4 w-4" stroke={2} /> New project
                    </Link>
                }
            />

            <form method="GET" className="toolbar mb-6">
                <div className="relative min-w-0 flex-1 sm:min-w-56 sm:max-w-xs">
                    <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className="form-input pl-9" name="q" defaultValue={q} placeholder="Search projects" aria-label="Search projects" />
                    {status && <input type="hidden" name="status" value={status} />}
                </div>
                <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                    {[{ value: '', label: 'All' }, ...ProjectStatus.options()].map(({ value, label }) => (
                        <Link
                            key={value || 'all'}
                            href={withQuery('/projects', { q: q || null, status: value || null })}
                            className={cx(
                                'rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition',
                                status === value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                            )}
                        >
                            {label}
                        </Link>
                    ))}
                </div>
                <button className="btn-secondary sm:ml-auto" type="submit">
                    Search
                </button>
            </form>

            {rows.length === 0 ? (
                <div className="card">
                    <EmptyState icon="folder" title="No projects found" description={q ? 'No projects match your search. Try different keywords.' : 'Create a project to give your work a home.'}>
                        <Link href="/projects/new" className="btn-primary">
                            Create project
                        </Link>
                    </EmptyState>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map((project) => {
                        const overdue = isProjectOverdue(project, day);
                        const taskCount = taskCounts.get(project.id) ?? 0;
                        return (
                            <Link key={project.id} href={`/projects/${project.id}`} className="card card-hover group relative block overflow-hidden">
                                <span className={`absolute inset-x-0 top-0 h-1 bg-${project.color}-500`} />
                                <div className="p-5 pt-6">
                                    <div className="flex items-start justify-between gap-3">
                                        <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-slate-900 group-hover:text-indigo-600">{project.name}</h2>
                                        <HealthBadge health={project.health} size="sm" />
                                    </div>
                                    <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-slate-500">{project.description || 'No description yet.'}</p>

                                    <div className="mt-5 flex items-center gap-3">
                                        <ProgressBar value={project.progress} size="sm" className="flex-1" />
                                        <span className="text-xs font-semibold text-slate-600 tabular-nums">{project.progress}%</span>
                                    </div>

                                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                                        <div className="flex items-center gap-2">
                                            <AvatarStack users={members.get(project.id) ?? []} max={3} />
                                            <span className="text-xs text-slate-500">
                                                {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                                            </span>
                                        </div>
                                        {project.dueDate ? (
                                            <span className={cx('inline-flex items-center gap-1 text-xs whitespace-nowrap', overdue ? 'font-semibold text-red-600' : 'text-slate-500')}>
                                                <Icon name={overdue ? 'alert' : 'calendar'} className="h-3.5 w-3.5" />
                                                {formatDate(project.dueDate, 'M j')}
                                            </span>
                                        ) : (
                                            <ProjectStatusBadge status={project.status} />
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            <div className="mt-6">
                <Pagination page={page} lastPage={lastPage(Number(total), PER_PAGE)} total={Number(total)} perPage={PER_PAGE} href={(p) => withQuery('/projects', { q: q || null, status: status || null, page: p })} />
            </div>
        </>
    );
}

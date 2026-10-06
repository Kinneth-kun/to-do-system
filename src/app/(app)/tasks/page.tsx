import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { projectAlive, projectVisibleTo, taskAlive, taskInvolving, taskVisibleTo } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { Department, TaskStatus, taskStatusColor } from '@/lib/enums';
import { contains } from '@/lib/search';
import { withQuery } from '@/lib/urls';
import { buildTaskRows, lastPage, paging, param } from '@/lib/views';
import { Icon } from '@/components/icon';
import { AutoSubmitSelect } from '@/components/client/auto-submit';
import { TaskRow } from '@/components/tasks/task-row';
import { cx, EmptyState, PageHeader, Pagination } from '@/components/ui';

export async function generateMetadata(): Promise<Metadata> {
    return { title: (await requireUser()).fullAccess ? 'All Tasks' : 'My Tasks' };
}

const PER_PAGE = 10;
const { tasks } = schema;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const params = await searchParams;

    const q = param(params.q)?.trim().slice(0, 100) || '';
    const status = TaskStatus.is(param(params.status)) ? (param(params.status) as TaskStatus) : '';
    const department = user.fullAccess && Department.is(param(params.department)) ? param(params.department)! : '';
    const mine = ['1', 'true', 'on'].includes(param(params.mine) ?? '');
    // ?project_id=<id>, or ?project_id=standalone for tasks that aren't in any project.
    const standaloneOnly = param(params.project_id) === 'standalone';
    const projectId = /^\d+$/.test(param(params.project_id) ?? '') ? Number(param(params.project_id)) : null;

    const projects = await db()
        .select({ id: schema.projects.id, name: schema.projects.name })
        .from(schema.projects)
        .where(and(projectAlive, projectVisibleTo(user)))
        .orderBy(asc(schema.projects.name));
    if (projectId && !projects.some((p) => p.id === projectId)) notFound();

    const where = and(
        taskAlive,
        taskVisibleTo(user),
        q ? contains(tasks.title, q) : undefined,
        status ? eq(tasks.status, status) : undefined,
        projectId ? eq(tasks.projectId, projectId) : standaloneOnly ? isNull(tasks.projectId) : undefined,
        mine ? taskInvolving(user.id) : undefined,
        department ? sql`exists (select 1 from users u where u.id = ${tasks.assigneeId} and u.department = ${department})` : undefined,
    );

    const { page, offset } = paging(params, PER_PAGE);
    const [{ total }] = await db().select({ total: count() }).from(tasks).where(where);
    const rows = await db()
        .select()
        .from(tasks)
        .where(where)
        .orderBy(sql`${tasks.dueDate} desc nulls last`, desc(tasks.createdAt))
        .limit(PER_PAGE)
        .offset(offset);
    const taskRows = await buildTaskRows(user, rows);

    const active = { q: q || null, status: status || null, project_id: standaloneOnly ? 'standalone' : projectId, mine: mine || null, department: department || null };
    const hasFilters = Object.values(active).some(Boolean);

    return (
        <>
            <PageHeader
                title={user.fullAccess ? 'All tasks' : 'My tasks'}
                description="Track project work and standalone tasks in one place."
            />

            {/* Status filter row */}
            <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <div className="flex min-w-max items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                    {[{ value: '', label: 'All statuses' }, ...TaskStatus.options()].map(({ value, label }) => {
                        const on = status === value;
                        return (
                            <Link
                                key={value || 'all'}
                                href={withQuery('/tasks', { ...active, status: value || null })}
                                className={cx(
                                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition',
                                    on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                                )}
                            >
                                {value && <span className={`h-1.5 w-1.5 rounded-full bg-${taskStatusColor(value as TaskStatus)}-500`} />}
                                {label}
                            </Link>
                        );
                    })}
                </div>
            </div>

            <form method="GET" className="toolbar mb-6">
                <input type="hidden" name="status" value={status} />
                <div className="relative min-w-0 flex-1 sm:min-w-56 sm:max-w-xs">
                    <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    {/* Press Enter to search; the other filters apply as soon as they change. */}
                    <input type="search" className="form-input pl-9" name="q" defaultValue={q} placeholder="Search tasks" aria-label="Search tasks" enterKeyHint="search" />
                </div>
                {/* Regular users only see their own department's tasks (plus collaborations). */}
                {user.fullAccess && (
                    <AutoSubmitSelect className="form-select sm:w-56" name="department" defaultValue={department} aria-label="Filter by department">
                        <option value="">All departments</option>
                        {Department.options().map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </AutoSubmitSelect>
                )}
                <AutoSubmitSelect className="form-select sm:w-52" name="project_id" defaultValue={standaloneOnly ? 'standalone' : (projectId ?? '')} aria-label="Filter by project">
                    <option value="">All projects</option>
                    <option value="standalone">Standalone tasks</option>
                    {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </AutoSubmitSelect>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                    <AutoSubmitSelect as="checkbox" name="mine" value="1" defaultChecked={mine} className="form-checkbox" />
                    Only mine
                </label>
                {hasFilters && (
                    <Link href="/tasks" className="btn-ghost btn-sm">
                        Clear
                    </Link>
                )}
                <Link href="/tasks/new" className="btn-primary sm:ml-auto">
                    <Icon name="plus" className="h-4 w-4" stroke={2} /> New task
                </Link>
            </form>

            <div className="card">
                <div className="divide-y divide-slate-100">
                    {taskRows.length ? (
                        taskRows.map((task) => <TaskRow key={task.id} task={task} />)
                    ) : (
                        <EmptyState icon="tasks" title="No matching tasks" description={hasFilters ? 'Try clearing a filter or searching for something else.' : 'Create your first task to get started.'}>
                            <Link href="/tasks/new" className="btn-primary btn-sm">
                                New task
                            </Link>
                        </EmptyState>
                    )}
                </div>
                {Number(total) > PER_PAGE && (
                    <div className="border-t border-slate-100 px-5 py-3">
                        <Pagination page={page} lastPage={lastPage(Number(total), PER_PAGE)} total={Number(total)} perPage={PER_PAGE} href={(p) => withQuery('/tasks', { ...active, page: p })} />
                    </div>
                )}
            </div>
        </>
    );
}

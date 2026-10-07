import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
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
import { cx, EmptyState, PageHeader, Pagination, StandaloneBadge } from '@/components/ui';

export async function generateMetadata(): Promise<Metadata> {
    return { title: (await requireUser()).fullAccess ? 'All Tasks' : 'My Tasks' };
}

const PER_PAGE = 10;
const { tasks } = schema;

type TaskType = 'project' | 'standalone';
const TYPE_OPTIONS: { value: TaskType | ''; label: string }[] = [
    { value: '', label: 'All tasks' },
    { value: 'project', label: 'Project tasks' },
    { value: 'standalone', label: 'Standalone tasks' },
];

type TaskSort = 'desc' | 'asc' | 'az' | 'za';
const SORT_OPTIONS: { value: TaskSort; label: string }[] = [
    { value: 'desc', label: 'Due date: latest first' },
    { value: 'asc', label: 'Due date: earliest first' },
    { value: 'az', label: 'Title: A to Z' },
    { value: 'za', label: 'Title: Z to A' },
];

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const params = await searchParams;

    const q = param(params.q)?.trim().slice(0, 100) || '';
    const status = TaskStatus.is(param(params.status)) ? (param(params.status) as TaskStatus) : '';
    const department = user.fullAccess && Department.is(param(params.department)) ? param(params.department)! : '';
    const mine = ['1', 'true', 'on'].includes(param(params.mine) ?? '');
    // ?sort=desc|asc|az|za — order within each group: by due date (latest first by default) or by title.
    const sort: TaskSort = SORT_OPTIONS.find((o) => o.value === param(params.sort))?.value ?? 'desc';
    // ?project_id=<id>; ?type=project|standalone (?project_id=standalone still means standalone).
    const requestedType = param(params.project_id) === 'standalone' ? 'standalone' : param(params.type);
    const projectId = requestedType !== 'standalone' && /^\d+$/.test(param(params.project_id) ?? '') ? Number(param(params.project_id)) : null;
    const type: TaskType | '' = requestedType === 'standalone' ? 'standalone' : projectId || requestedType === 'project' ? 'project' : '';

    const projects = await db()
        .select({ id: schema.projects.id, name: schema.projects.name })
        .from(schema.projects)
        .where(and(projectAlive, projectVisibleTo(user)))
        .orderBy(asc(schema.projects.name));
    if (projectId && !projects.some((p) => p.id === projectId)) notFound();

    // Every filter except the type, so the tabs can show how many of each there are.
    const filtered = and(
        taskAlive,
        taskVisibleTo(user),
        q ? contains(tasks.title, q) : undefined,
        status ? eq(tasks.status, status) : undefined,
        projectId ? eq(tasks.projectId, projectId) : undefined,
        mine ? taskInvolving(user.id) : undefined,
        department ? sql`exists (select 1 from users u where u.id = ${tasks.assigneeId} and u.department = ${department})` : undefined,
    );
    const where = and(filtered, type === 'project' ? isNotNull(tasks.projectId) : type === 'standalone' ? isNull(tasks.projectId) : undefined);

    // Group sizes: one per project, plus standalone (key null).
    const groupRows = await db().select({ projectId: tasks.projectId, c: count() }).from(tasks).where(filtered).groupBy(tasks.projectId);
    const groupSize = new Map(groupRows.map((g) => [g.projectId, Number(g.c)]));
    const typeCounts = {
        '': groupRows.reduce((sum, g) => sum + Number(g.c), 0),
        project: groupRows.filter((g) => g.projectId !== null).reduce((sum, g) => sum + Number(g.c), 0),
        standalone: groupSize.get(null) ?? 0,
    };

    // Categorised: project tasks grouped by project (A–Z), then standalone tasks; due date within each.
    const { page, offset } = paging(params, PER_PAGE);
    const total = type ? typeCounts[type] : typeCounts[''];
    const rows = await db()
        .select()
        .from(tasks)
        .where(where)
        .orderBy(
            sql`${tasks.projectId} is null`,
            sql`(select lower(p.name) from projects p where p.id = ${tasks.projectId})`,
            tasks.projectId,
            ...{
                desc: [sql`${tasks.dueDate} desc nulls last`],
                asc: [sql`${tasks.dueDate} asc nulls last`],
                az: [sql`lower(${tasks.title}) asc`, sql`${tasks.dueDate} asc nulls last`],
                za: [sql`lower(${tasks.title}) desc`, sql`${tasks.dueDate} asc nulls last`],
            }[sort],
            desc(tasks.createdAt),
        )
        .limit(PER_PAGE)
        .offset(offset);
    const taskRows = await buildTaskRows(user, rows);
    // A header wherever the group changes (and at the top of every page).
    const groupKey = (t: (typeof taskRows)[number]) => (t.standalone ? 'standalone' : `p${t.project?.id ?? 0}`);

    const active = { q: q || null, status: status || null, type: projectId ? null : type || null, project_id: projectId, mine: mine || null, department: department || null, sort: sort === 'desc' ? null : sort };
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
                <AutoSubmitSelect className="form-select sm:w-52" name="project_id" defaultValue={projectId ?? ''} aria-label="Filter by project">
                    <option value="">All projects</option>
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
                {/* Project tasks vs standalone tasks, with how many of each match the other filters. */}
                <AutoSubmitSelect className="form-select sm:w-52" name="type" defaultValue={type} aria-label="Project or standalone tasks">
                    {TYPE_OPTIONS.map((o) => (
                        <option key={o.value || 'all'} value={o.value}>
                            {o.label} ({typeCounts[o.value]})
                        </option>
                    ))}
                </AutoSubmitSelect>
                <AutoSubmitSelect className="form-select sm:w-56" name="sort" defaultValue={sort} aria-label="Sort tasks">
                    {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </AutoSubmitSelect>
                <Link href="/tasks/new" className="btn-primary sm:ml-auto">
                    <Icon name="plus" className="h-4 w-4" stroke={2} /> New task
                </Link>
            </form>

            <div className="card">
                <div className="divide-y divide-slate-100">
                    {taskRows.length ? (
                        taskRows.map((task, i) => {
                            const startsGroup = i === 0 || groupKey(taskRows[i - 1]) !== groupKey(task);
                            const size = groupSize.get(task.standalone ? null : (task.project?.id ?? null)) ?? 0;
                            return (
                                <div key={task.id}>
                                    {startsGroup && (
                                        <div className="flex items-center gap-2 bg-slate-50/80 px-4 py-2 text-xs font-semibold text-slate-600">
                                            {task.standalone ? (
                                                <StandaloneBadge />
                                            ) : (
                                                <Link href={`/projects/${task.project?.id}`} className="inline-flex min-w-0 items-center gap-2 hover:text-indigo-600">
                                                    <span className={`h-2.5 w-2.5 shrink-0 rounded-sm bg-${task.project?.color ?? 'slate'}-500`} />
                                                    <span className="truncate">{task.project?.name ?? 'Project'}</span>
                                                </Link>
                                            )}
                                            <span className="font-normal text-slate-400">
                                                {size} {size === 1 ? 'task' : 'tasks'}
                                            </span>
                                        </div>
                                    )}
                                    <div className={startsGroup ? 'border-t border-slate-100' : ''}>
                                        {/* The group header already names the project. */}
                                        <TaskRow task={task} showProject={false} />
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <EmptyState icon="tasks" title="No matching tasks" description={hasFilters ? 'Try clearing a filter or searching for something else.' : 'Create your first task to get started.'}>
                            <Link href="/tasks/new" className="btn-primary btn-sm">
                                New task
                            </Link>
                        </EmptyState>
                    )}
                </div>
                {total > PER_PAGE && (
                    <div className="border-t border-slate-100 px-5 py-3">
                        <Pagination page={page} lastPage={lastPage(total, PER_PAGE)} total={total} perPage={PER_PAGE} href={(p) => withQuery('/tasks', { ...active, page: p })} />
                    </div>
                )}
            </div>
        </>
    );
}

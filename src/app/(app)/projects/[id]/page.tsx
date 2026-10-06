import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { and, asc, count, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { can, projectAccess } from '@/lib/access';
import { deleteProjectAction } from '@/app/actions/projects';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { addDays, formatDate, today } from '@/lib/dates';
import { Priority, ProjectHealth, ProjectStatus } from '@/lib/enums';
import { ProjectHealthService, taskCounts } from '@/lib/services/health';
import { findProject } from '@/lib/services/projects';
import { Settings } from '@/lib/settings';
import { isProjectOverdue } from '@/lib/task-utils';
import { userLiteColumns, usersByIds, type UserLite } from '@/lib/users';
import { buildTaskRows } from '@/lib/views';
import { Icon } from '@/components/icon';
import { ConfirmForm } from '@/components/client/confirm';
import { AddMemberForm, MemberControls } from '@/components/projects/team';
import { SetCurrentProject } from '@/components/shell/project-picker';
import { TaskRow } from '@/components/tasks/task-row';
import { Avatar, cx, DepartmentBadge, EmptyState, HealthBadge, PageHeader, PriorityBadge, ProgressRing, ProjectStatusBadge } from '@/components/ui';

type Props = { params: Promise<{ id: string }> };

async function load(idParam: string) {
    const user = await requireUser();
    const id = Number(idParam);
    const project = Number.isInteger(id) ? await findProject(id) : null;
    if (!project) notFound();
    const access = (await projectAccess(id))!;
    return { user, project, access, allowed: can.viewProject(user, access) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { project, allowed } = await load((await params).id);
    return { title: allowed ? project.name : 'Project' };
}

export default async function ProjectPage({ params }: Props) {
    const { user, project, access, allowed } = await load((await params).id);
    if (!allowed) forbidden();

    const day = today();
    const dueSoonDays = await Settings.int('deadline.due_soon_days');
    const counts = await taskCounts(project.id);
    const evaluation = await ProjectHealthService.evaluate(project);
    const [{ dueSoon }] = await db()
        .select({ dueSoon: count() })
        .from(schema.tasks)
        .where(
            and(
                eq(schema.tasks.projectId, project.id),
                isNull(schema.tasks.deletedAt),
                inArray(schema.tasks.status, ['pending', 'in_progress']),
                sql`${schema.tasks.dueDate} between ${day} and ${addDays(day, dueSoonDays)}`,
            ),
        );

    const people = await usersByIds([project.ownerId, project.createdBy]);
    const owner = people.get(project.ownerId) ?? null;
    const creator = people.get(project.createdBy) ?? null;

    const members = (await db()
        .select({ ...userLiteColumns, role: schema.projectMembers.role })
        .from(schema.projectMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
        .where(eq(schema.projectMembers.projectId, project.id))
        .orderBy(asc(schema.projectMembers.createdAt))) as (UserLite & { role: string })[];

    const taskRows = await db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.projectId, project.id), isNull(schema.tasks.deletedAt)))
        .orderBy(asc(schema.tasks.position), asc(schema.tasks.id));
    const rows = await buildTaskRows(user, taskRows);

    const canManage = can.manageMembers(user, access);
    const canCreateTask = can.createTask(user, access);
    const candidates = canManage
        ? await db()
              .select({ id: schema.users.id, name: schema.users.name })
              .from(schema.users)
              .where(and(eq(schema.users.isActive, true), members.length ? notInArray(schema.users.id, members.map((m) => m.id)) : undefined))
              .orderBy(asc(schema.users.name))
        : [];

    const overdue = isProjectOverdue(project, day);
    const health = project.health as ProjectHealth;
    const stats: [string, number, string][] = [
        ['Total', counts.total, 'slate'],
        ['In progress', counts.in_progress, 'blue'],
        ['Completed', counts.completed, 'emerald'],
        ['Delayed', counts.delayed, 'red'],
        ['Due soon', Number(dueSoon), 'amber'],
    ];
    const details: [string, string][] = [
        ['Status', ProjectStatus.label(project.status as ProjectStatus)],
        ['Priority', Priority.label(project.priority as Priority)],
        ['Start date', project.startDate ? formatDate(project.startDate, 'M j, Y') : '—'],
        ['Due date', project.dueDate ? formatDate(project.dueDate, 'M j, Y') : '—'],
        ['Created by', creator?.name ?? '—'],
    ];

    return (
        <>
            <SetCurrentProject id={project.id} />
            <PageHeader
                title={project.name}
                back="/projects"
                meta={
                    <>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <HealthBadge health={health} />
                            <ProjectStatusBadge status={project.status} />
                            <PriorityBadge priority={project.priority} showLow={false} />
                            <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                                <Avatar user={owner} size="xs" /> {owner?.name}
                            </span>
                            {project.dueDate && (
                                <span className={cx('inline-flex items-center gap-1 text-sm', overdue ? 'font-semibold text-red-600' : 'text-slate-500')}>
                                    <Icon name="calendar" className="h-4 w-4" />
                                    {project.startDate ? `${formatDate(project.startDate, 'M j')} – ` : 'Due '}
                                    {formatDate(project.dueDate, 'M j, Y')}
                                </span>
                            )}
                        </div>
                        {project.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed whitespace-pre-line text-slate-600">{project.description}</p>}
                    </>
                }
                actions={
                    <>
                        {canCreateTask && (
                            <Link href={`/tasks/new?project_id=${project.id}`} className="btn-primary">
                                <Icon name="plus" className="h-4 w-4" stroke={2} /> Add task
                            </Link>
                        )}
                        {can.updateProject(user, access) && (
                            <Link href={`/projects/${project.id}/edit`} className="btn-secondary">
                                <Icon name="pencil" className="h-4 w-4" /> Edit
                            </Link>
                        )}
                        {can.deleteProject(user, access) && (
                            <ConfirmForm
                                action={deleteProjectAction.bind(null, project.id)}
                                title="Delete project"
                                message={`This deletes ${project.name} and every task inside it. This cannot be undone.`}
                                confirm="Delete project"
                            >
                                <button className="btn-ghost text-red-600 hover:bg-red-50" type="submit" aria-label="Delete project">
                                    <Icon name="trash" className="h-4 w-4" />
                                </button>
                            </ConfirmForm>
                        )}
                    </>
                }
            />

            {/* Health & progress summary */}
            <section className="card mb-6">
                <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
                    <div className="flex items-center gap-5">
                        <ProgressRing value={project.progress} size={112} color={ProjectHealth.meta[health]?.color} sublabel="complete" />
                        <div className="min-w-0">
                            <p className="eyebrow">Health</p>
                            <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{ProjectHealth.label(health)}</p>
                            <ul className="mt-1.5 space-y-1">
                                {evaluation.reasons.map((reason) => (
                                    <li key={reason} className="flex items-start gap-1.5 text-sm text-slate-500">
                                        <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                        <span>{reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {stats.map(([label, value, color]) => (
                            <div key={label} className="flex flex-col justify-between rounded-xl border border-slate-200/80 p-3.5">
                                <dt className="truncate text-xs font-medium text-slate-500">{label}</dt>
                                <dd className={cx('mt-1 text-2xl font-semibold tracking-tight tabular-nums', value > 0 && color !== 'slate' ? `text-${color}-600` : 'text-slate-900')}>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <section className="card min-w-0 self-start">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">Tasks</h2>
                            <p className="mt-0.5 text-xs text-slate-500">{counts.total} {counts.total === 1 ? 'task' : 'tasks'}</p>
                        </div>
                        {canCreateTask && (
                            <Link className="btn-secondary btn-sm" href={`/tasks/new?project_id=${project.id}`}>
                                <Icon name="plus" className="h-3.5 w-3.5" stroke={2} /> Add task
                            </Link>
                        )}
                    </div>
                    <div className="divide-y divide-slate-100">
                        {rows.length ? (
                            rows.map((task) => <TaskRow key={task.id} task={task} showProject={false} />)
                        ) : (
                            <EmptyState icon="tasks" title="No tasks yet" description="Add the first task to start tracking progress.">
                                {canCreateTask && (
                                    <Link href={`/tasks/new?project_id=${project.id}`} className="btn-primary btn-sm">
                                        Add task
                                    </Link>
                                )}
                            </EmptyState>
                        )}
                    </div>
                </section>

                <aside className="space-y-6">
                    <section className="card self-start" id="members">
                        <div className="card-header">
                            <h2 className="card-title">Team</h2>
                            <span className="text-xs text-slate-500">{members.length}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {members.map((member) => (
                                <div key={member.id} className="flex items-start gap-3 px-5 py-3">
                                    <Avatar user={member} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-slate-800">{member.name}</p>
                                        <p className="truncate text-xs text-slate-500">{member.jobTitle || member.username}</p>
                                        {member.department && <DepartmentBadge department={member.department} size="sm" className="mt-1" />}
                                        {canManage && project.ownerId !== member.id && (
                                            <div className="mt-2">
                                                <MemberControls projectId={project.id} userId={member.id} name={member.name} role={member.role} />
                                            </div>
                                        )}
                                    </div>
                                    {project.ownerId === member.id ? (
                                        <span className="chip bg-indigo-50 text-indigo-700">Owner</span>
                                    ) : (
                                        !canManage && member.role === 'manager' && <span className="chip bg-slate-100 text-slate-600">Manager</span>
                                    )}
                                </div>
                            ))}
                        </div>
                        {candidates.length > 0 && (
                            <div className="border-t border-slate-100 p-3">
                                <AddMemberForm projectId={project.id} candidates={candidates} />
                            </div>
                        )}
                    </section>

                    <section className="card self-start">
                        <div className="card-header">
                            <h2 className="card-title">Details</h2>
                        </div>
                        <dl className="divide-y divide-slate-100 text-sm">
                            {details.map(([label, value]) => (
                                <div key={label} className="flex items-center justify-between gap-3 px-5 py-2.5">
                                    <dt className="text-slate-500">{label}</dt>
                                    <dd className="truncate font-medium text-slate-800">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                </aside>
            </div>
        </>
    );
}

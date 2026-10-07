import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { and, asc, desc, eq, isNull, notInArray } from 'drizzle-orm';
import { can, taskAccess } from '@/lib/access';
import { deleteAttachmentAction, deleteCommentAction, deleteTaskAction, removeCollaboratorAction } from '@/app/actions/tasks';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { diffForHumans, formatDate } from '@/lib/dates';
import { Department, FULL_ACCESS_ROLES, Priority, TaskCategory, TaskStatus, taskStatusColor } from '@/lib/enums';
import { blobAccess, blobEnabled, humanSize } from '@/lib/storage';
import { userLiteColumns, usersByIds, type UserLite } from '@/lib/users';
import { describeDue, dueContext, loadHistory } from '@/lib/views';
import { Icon } from '@/components/icon';
import { ConfirmForm } from '@/components/client/confirm';
import { SetCurrentProject } from '@/components/shell/project-picker';
import { AddCollaboratorForm, AttachmentUploader, CommentForm } from '@/components/tasks/collaboration';
import { History } from '@/components/tasks/history';
import { FocusButton } from '@/components/tasks/focus-button';
import { QuickUpdate } from '@/components/tasks/quick-update';
import { Avatar, CategoryBadge, DepartmentBadge, DueDate, PageHeader, PriorityBadge, ProgressBar, StandaloneBadge, StatusBadge } from '@/components/ui';

type Props = { params: Promise<{ id: string }> };

async function loadTask(id: string) {
    if (!/^\d+$/.test(id)) notFound();
    const [task] = await db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, Number(id)), isNull(schema.tasks.deletedAt)));
    if (!task) notFound();
    return task;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    // Only reveal the title to someone allowed to see the task.
    const user = await requireUser();
    const id = Number((await params).id) || 0;
    const access = await taskAccess(id);
    if (!access || !can.viewTask(user, access)) return { title: 'Task' };
    const [task] = await db().select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, id));
    return { title: task?.title ?? 'Task' };
}

export default async function TaskPage({ params }: Props) {
    const user = await requireUser();
    const task = await loadTask((await params).id);
    const access = (await taskAccess(task.id))!;
    if (!can.viewTask(user, access)) forbidden();

    const [project] = task.projectId
        ? await db().select({ id: schema.projects.id, name: schema.projects.name, color: schema.projects.color }).from(schema.projects).where(eq(schema.projects.id, task.projectId))
        : [];
    const people = await usersByIds([task.assigneeId, task.createdBy].filter((id): id is number => !!id));
    const assignee = task.assigneeId ? (people.get(task.assigneeId) ?? null) : null;
    const creator = people.get(task.createdBy) ?? null;


    const collaborators = (await db()
        .select(userLiteColumns)
        .from(schema.taskCollaborators)
        .innerJoin(schema.users, eq(schema.users.id, schema.taskCollaborators.userId))
        .where(eq(schema.taskCollaborators.taskId, task.id))
        .orderBy(asc(schema.taskCollaborators.createdAt))) as UserLite[];

    const comments = await db().select().from(schema.taskComments).where(eq(schema.taskComments.taskId, task.id)).orderBy(asc(schema.taskComments.createdAt), asc(schema.taskComments.id));
    const attachments = await db()
        .select()
        .from(schema.attachments)
        .where(and(eq(schema.attachments.attachableType, 'task'), eq(schema.attachments.attachableId, task.id)))
        .orderBy(desc(schema.attachments.createdAt));
    const authors = await usersByIds([...comments.map((c) => c.userId), ...attachments.map((a) => a.userId)]);
    const history = await loadHistory(task.id, 15);

    const canManageCollaborators = can.manageCollaborators(user, access);
    const canComment = can.comment(user, access);
    const canEdit = can.editTask(user, access);
    // Administrators and executives already see every task, so they're not offered as collaborators.
    const candidates = canManageCollaborators
        ? await db()
              .select({ id: schema.users.id, name: schema.users.name, username: schema.users.username })
              .from(schema.users)
              .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
              .where(
                  and(
                      eq(schema.users.isActive, true),
                      notInArray(schema.users.id, [...collaborators.map((c) => c.id), task.assigneeId ?? 0]),
                      notInArray(schema.roles.name, [...FULL_ACCESS_ROLES]),
                  ),
              )
              .orderBy(asc(schema.users.name))
        : [];

    const due = describeDue(task, await dueContext(), 'M j, Y');
    const focused = (
        await db()
            .select({ id: schema.taskFocus.id })
            .from(schema.taskFocus)
            .where(and(eq(schema.taskFocus.userId, user.id), eq(schema.taskFocus.taskId, task.id)))
            .limit(1)
    ).length > 0;
    const status = task.status as TaskStatus;
    const details: [string, string][] = [
        ['Project', project?.name ?? (task.projectId ? '—' : 'None (standalone)')],
        ...(TaskCategory.is(task.category) ? [['Type', TaskCategory.label(task.category)] as [string, string]] : []),
        ['Priority', Priority.label(task.priority as Priority)],
        ['Start date', task.startDate ? formatDate(task.startDate, 'M j, Y') : '—'],
        ['Due date', task.dueDate ? formatDate(task.dueDate, 'M j, Y') : '—'],
        ['Completed', task.completedAt ? formatDate(task.completedAt, 'M j, Y') : '—'],
        ['Created', formatDate(task.createdAt, 'M j, Y')],
    ];

    return (
        <>
            {task.projectId && <SetCurrentProject id={task.projectId} />}
            <PageHeader
                title={task.title}
                back="/tasks"
                meta={
                    <>
                        <nav className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
                            {project ? (
                                <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 hover:text-slate-700">
                                    <span className={`h-2 w-2 rounded-sm bg-${project.color}-500`} />
                                    {project.name}
                                </Link>
                            ) : (
                                !task.projectId && <StandaloneBadge />
                            )}
                        </nav>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <StatusBadge status={status} size="lg" />
                            <CategoryBadge category={task.category} />
                            <PriorityBadge priority={task.priority} />
                            <DueDate text={due.text} state={due.state} title={due.title} />
                            {task.latestUpdateAt && <span className="text-xs text-slate-400">Updated {diffForHumans(task.latestUpdateAt)}</span>}
                        </div>
                    </>
                }
                actions={
                    <>
                        <FocusButton taskId={task.id} focused={focused} labelled />
                        {canEdit && (
                            <Link className="btn-secondary" href={`/tasks/${task.id}/edit`}>
                                <Icon name="pencil" className="h-4 w-4" /> Edit
                            </Link>
                        )}
                        {can.deleteTask(user, access) && (
                            <ConfirmForm
                                action={deleteTaskAction.bind(null, task.id)}
                                title="Delete task"
                                message="This deletes the task along with its update history. This cannot be undone."
                                confirm="Delete task"
                            >
                                <button className="btn-ghost text-red-600 hover:bg-red-50" type="submit" aria-label="Delete task">
                                    <Icon name="trash" className="h-4 w-4" />
                                </button>
                            </ConfirmForm>
                        )}
                    </>
                }
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0 space-y-6">
                    {/* Progress + quick update: the primary action on this page */}
                    <section className="card">
                        <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-5">
                            <div className="flex items-center gap-3">
                                <span className="metric">
                                    {task.progress}
                                    <span className="text-xl text-slate-400">%</span>
                                </span>
                                <div>
                                    <p className="eyebrow">Progress</p>
                                    <p className="text-sm text-slate-500">{TaskStatus.label(status)}</p>
                                </div>
                            </div>
                            {task.latestRemark && <p className="max-w-md text-sm text-slate-500 italic">“{task.latestRemark}”</p>}
                        </div>
                        <div className="px-5 pt-4">
                            <ProgressBar value={task.progress} size="lg" color={taskStatusColor(status)} />
                        </div>
                        {can.updateTask(user, access) ? (
                            <div className="mt-5 border-t border-slate-100 bg-slate-50/60 p-5">
                                <p className="eyebrow mb-3">Post an update</p>
                                <QuickUpdate taskId={task.id} status={status} progress={task.progress} />
                            </div>
                        ) : user.fullAccess ? (
                            <p className="mt-5 flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500">
                                <Icon name="eye" className="h-4 w-4 shrink-0" /> View only — updates come from the people assigned to this task.
                            </p>
                        ) : (
                            <div className="h-5" />
                        )}
                    </section>

                    {task.description && (
                        <section className="card">
                            <div className="card-header">
                                <h2 className="card-title">Description</h2>
                            </div>
                            <div className="card-body">
                                <p className="text-sm leading-relaxed whitespace-pre-line text-slate-600">{task.description}</p>
                            </div>
                        </section>
                    )}

                    {/* Collaborators */}
                    <section className="card">
                        <div className="card-header">
                            <h2 className="card-title">Collaborators</h2>
                            {canManageCollaborators && <span className="text-xs text-slate-500">{collaborators.length}</span>}
                        </div>
                        <div className="card-body space-y-4">
                            {collaborators.length ? (
                                <div className="flex flex-wrap gap-3">
                                    {collaborators.map((c) => (
                                        <div key={c.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                                            <Avatar user={c} size="sm" />
                                            <span className="max-w-32 truncate text-sm text-slate-700">{c.name}</span>
                                            {canManageCollaborators && (
                                                <ConfirmForm
                                                    action={removeCollaboratorAction.bind(null, task.id, c.id)}
                                                    title="Remove collaborator"
                                                    message="They will stop receiving updates about this task."
                                                    confirm="Remove"
                                                    danger={false}
                                                >
                                                    <button type="submit" className="btn-icon h-7 w-7 text-slate-400 hover:text-red-600" aria-label={`Remove ${c.name}`}>
                                                        <Icon name="x" className="h-4 w-4" />
                                                    </button>
                                                </ConfirmForm>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">No collaborators yet.</p>
                            )}
                            {canManageCollaborators && <AddCollaboratorForm taskId={task.id} people={candidates} />}
                        </div>
                    </section>

                    {/* Comments */}
                    <section className="card">
                        <div className="card-header">
                            <h2 className="card-title">Comments</h2>
                        </div>
                        <div className="card-body space-y-5">
                            {comments.length ? (
                                comments.map((comment) => {
                                    const author = authors.get(comment.userId) ?? null;
                                    return (
                                        <article key={comment.id} className="flex gap-3">
                                            <Avatar user={author} size="sm" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                                    <p className="text-sm font-semibold text-slate-900">{author?.name ?? 'Unknown user'}</p>
                                                    <time className="text-xs text-slate-400" dateTime={comment.createdAt.toISOString()} title={formatDate(comment.createdAt, 'M j, Y g:i A')}>
                                                        {diffForHumans(comment.createdAt)}
                                                    </time>
                                                </div>
                                                <p className="mt-1 text-sm break-words whitespace-pre-line text-slate-600">{comment.body}</p>
                                                {canComment && (comment.userId === user.id || canEdit) && (
                                                    <ConfirmForm action={deleteCommentAction.bind(null, comment.id)} className="mt-2" title="Delete comment" message="This removes the comment for everyone on the task." confirm="Delete">
                                                        <button className="text-xs font-medium text-red-600 hover:text-red-700" type="submit">
                                                            Delete
                                                        </button>
                                                    </ConfirmForm>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })
                            ) : (
                                <p className="text-sm text-slate-500">No comments yet.</p>
                            )}
                            {canComment && <CommentForm taskId={task.id} />}
                        </div>
                    </section>

                    {/* Attachments */}
                    <section className="card">
                        <div className="card-header">
                            <h2 className="card-title">Attachments</h2>
                            <span className="text-xs text-slate-500">{attachments.length}</span>
                        </div>
                        <div className="card-body space-y-3">
                            {attachments.length ? (
                                attachments.map((a) => (
                                    <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                            <Icon name="paperclip" className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <a className="block truncate text-sm font-medium text-indigo-600 hover:text-indigo-700" href={`/attachments/${a.id}`}>
                                                {a.originalName}
                                            </a>
                                            <p className="text-xs text-slate-500">
                                                {humanSize(a.size)} · {authors.get(a.userId)?.name ?? 'Unknown user'}
                                            </p>
                                        </div>
                                        {canComment && (a.userId === user.id || canEdit) && (
                                            <ConfirmForm action={deleteAttachmentAction.bind(null, a.id)} title="Delete attachment" message="The file will be removed from this task permanently." confirm="Delete">
                                                <button type="submit" className="btn-icon text-slate-400 hover:text-red-600" aria-label={`Delete ${a.originalName}`}>
                                                    <Icon name="trash" className="h-4 w-4" />
                                                </button>
                                            </ConfirmForm>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-slate-500">No attachments yet.</p>
                            )}
                            {canComment && <AttachmentUploader taskId={task.id} blob={blobEnabled()} access={blobAccess()} />}
                        </div>
                    </section>

                    {/* Append-only history */}
                    <section className="card">
                        <div className="card-header">
                            <h2 className="card-title">History</h2>
                            <Link className="link text-sm" href={`/tasks/${task.id}/updates`}>
                                Full history
                            </Link>
                        </div>
                        <div className="card-body">
                            <History updates={history} />
                        </div>
                    </section>
                </div>

                <aside className="space-y-6">
                    <section className="card self-start">
                        <div className="card-header">
                            <h2 className="card-title">People</h2>
                        </div>
                        <div className="divide-y divide-slate-100">
                            <div className="flex items-center gap-3 px-5 py-3">
                                <Avatar user={assignee} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="eyebrow">Assignee</p>
                                    <p className="truncate text-sm font-medium text-slate-800">{assignee?.name ?? 'Unassigned'}</p>
                                    {assignee?.department && (
                                        <Link href={`/tasks?department=${assignee.department}`} className="mt-1 inline-block">
                                            <DepartmentBadge department={assignee.department} size="sm" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 px-5 py-3">
                                <Avatar user={creator} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="eyebrow">Created by</p>
                                    <p className="truncate text-sm font-medium text-slate-800">{creator?.name ?? '—'}</p>
                                    {creator?.department && <p className="mt-0.5 truncate text-xs text-slate-500">{Department.label(creator.department)}</p>}
                                </div>
                            </div>
                        </div>
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

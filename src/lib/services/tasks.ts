import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { db, schema, transaction } from '../db';
import { logActivity } from '../activity';
import { formatDate, now, today } from '../dates';
import { canAutoDelay, statusFromProgress, TaskCategory, TaskStatus, type Priority } from '../enums';
import { ValidationError } from '../errors';
import { loadTaskInfo, Notify } from '../notifications';
import { Settings } from '../settings';
import { isFullAccessUser } from '../users';
import { ProjectHealthService } from './health';

/*
 * Single entry point for task mutations. Enforces the business rules:
 *  - a task belongs to a project, or stands alone (short-term work with no project)
 *  - tasks added to a completed project are post-launch items (enhancement / bug fix / update)
 *    and don't change the finished project's progress
 *  - single primary assignee; project membership is never granted implicitly — people join a
 *    project only by an explicit choice (ProjectService.addMember)
 *  - status ⇄ progress sync (0% Pending, 1–99% In Progress, 100% Completed)
 *  - append-only history for every status/progress/remark/assignment/detail change
 *  - project progress/health recalculated after every change
 *  - overdue open tasks become Delayed; rescheduling clears an automatic delay
 */

export type TaskRow = typeof schema.tasks.$inferSelect;
export type Actor = { id: number; name: string };

const { tasks, taskUpdates, taskCollaborators, projects, users } = schema;

type CreateData = {
    projectId?: number | null;
    title: string;
    description?: string | null;
    /** Post-launch type; only used when the project is completed. */
    category?: TaskCategory | null;
    priority?: Priority | null;
    assigneeId?: number | null;
    startDate?: string | null;
    dueDate?: string | null;
    status?: TaskStatus | null;
    progress?: number | null;
    collaboratorIds?: number[];
};

type DetailsData = Partial<Pick<TaskRow, 'title' | 'description' | 'category' | 'priority' | 'startDate' | 'dueDate' | 'assigneeId'>>;

async function findTask(id: number): Promise<TaskRow | null> {
    const [row] = await db().select().from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt))).limit(1);
    return row ?? null;
}

async function saveTask(id: number, values: Partial<TaskRow>): Promise<void> {
    await db().update(tasks).set({ ...values, updatedAt: now() }).where(eq(tasks.id, id));
}

export const TaskService = {
    /* ============================================================== Create */

    async create(data: CreateData, actor: Actor): Promise<TaskRow> {
        return transaction(async () => {
            const projectId = data.projectId ?? null;

            // No project = a standalone task.
            let project: typeof projects.$inferSelect | null = null;
            if (projectId) {
                [project = null] = await db()
                    .select()
                    .from(projects)
                    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
                    .limit(1);
                if (!project) throw ValidationError.withMessages({ project_id: 'The selected project is invalid.' });
            }

            // Work added after the project is completed is a post-launch item, never a build task.
            const category = project?.status === 'completed' ? (data.category ?? 'enhancement') : null;

            const requestedProgress = clampProgress(data.progress ?? 0);
            const requestedStatus = data.status ? data.status : statusFromProgress(requestedProgress);
            const [status, progress] = normalize(requestedStatus, requestedProgress);

            const [{ value: maxPosition }] = await db()
                .select({ value: max(tasks.position) })
                .from(tasks)
                .where(project ? eq(tasks.projectId, project.id) : and(isNull(tasks.projectId), eq(tasks.createdBy, actor.id)));

            const at = now();
            const [task] = await db()
                .insert(tasks)
                .values({
                    projectId: project?.id ?? null,
                    title: data.title,
                    description: data.description ?? null,
                    category,
                    priority: data.priority ?? 'medium',
                    assigneeId: data.assigneeId ?? null,
                    startDate: data.startDate ?? null,
                    dueDate: data.dueDate ?? null,
                    status,
                    progress,
                    createdBy: actor.id,
                    completedAt: status === 'completed' ? at : null,
                    latestUpdateAt: at,
                    latestUpdateBy: actor.id,
                    position: (maxPosition ?? 0) + 1,
                    createdAt: at,
                    updatedAt: at,
                })
                .returning();

            await record(task.id, actor.id, 'created', null, status, null, progress);

            await logActivity(
                'task.created',
                `Created ${category ? TaskCategory.label(category).toLowerCase() : 'task'} "${task.title}"${project ? ` in ${project.name}` : ' (standalone)'}`,
                { type: 'task', id: task.id },
                { project_id: project?.id ?? null },
                actor.id,
            );

            if (task.assigneeId && task.assigneeId !== actor.id) {
                await Notify.taskAssigned(await loadTaskInfo(task.id), task.assigneeId, actor);
            }

            for (const userId of data.collaboratorIds ?? []) {
                await TaskService.addCollaborator(task.id, userId, actor);
            }

            await TaskService.syncDelay((await findTask(task.id))!);
            await TaskService.afterChange(task.id, actor);

            return (await findTask(task.id))!;
        });
    },

    /* ============================================================== Quick update (status / progress / remark) */

    /**
     * Apply a status/progress/remark update and record it in history.
     * Returns null when nothing changed and no remark was given.
     */
    async applyUpdate(
        taskId: number,
        actor: Actor,
        status: TaskStatus | null = null,
        progress: number | string | null = null,
        remarkInput: string | null = null,
    ): Promise<typeof taskUpdates.$inferSelect | null> {
        return transaction(async () => {
            const task = await findTask(taskId);
            if (!task) throw new Error('Task not found');

            const remark = remarkInput && remarkInput.trim() ? remarkInput.trim() : null;
            const oldStatus = task.status as TaskStatus;
            const oldProgress = task.progress;

            let requestedStatus: TaskStatus | null = status || null;
            const requestedProgress = progress !== null && progress !== '' ? clampProgress(Number(progress)) : null;

            // Forms submit both fields; an unchanged status means "progress drives".
            if (requestedStatus === oldStatus && requestedProgress !== null && requestedProgress !== oldProgress) {
                requestedStatus = null;
            }

            let [newStatus, newProgress] = resolve(oldStatus, oldProgress, requestedStatus, requestedProgress);

            // Choosing Pending/In Progress on an overdue task keeps it Delayed (auto-delay rule).
            let requestedBeforeDelay: TaskStatus | null = null;
            if (canAutoDelay(newStatus) && (await shouldBeDelayed(task))) {
                requestedBeforeDelay = newStatus;
                newStatus = 'delayed';
            }

            const statusChanged = newStatus !== oldStatus;
            const progressChanged = newProgress !== oldProgress;

            if (!statusChanged && !progressChanged && remark === null) return null;

            const at = now();
            await saveTask(task.id, {
                status: newStatus,
                progress: newProgress,
                ...statusSideFields(task, newStatus, oldStatus, requestedBeforeDelay),
                ...(remark !== null ? { latestRemark: remark } : {}),
                latestUpdateAt: at,
                latestUpdateBy: actor.id,
            });

            const type = statusChanged || progressChanged ? 'update' : 'remark';
            const update = await record(
                task.id,
                actor.id,
                type,
                oldStatus,
                newStatus,
                oldProgress,
                newProgress,
                remark,
                requestedBeforeDelay ? { requested_status: requestedBeforeDelay } : {},
            );

            let action: string;
            let description: string;
            if (statusChanged && newStatus === 'completed') {
                [action, description] = ['task.completed', `Completed "${task.title}"`];
            } else if (statusChanged) {
                [action, description] = ['task.status_changed', `Changed "${task.title}" from ${TaskStatus.label(oldStatus)} to ${TaskStatus.label(newStatus)}`];
            } else if (progressChanged) {
                [action, description] = ['task.progress_updated', `Updated "${task.title}" progress ${oldProgress}% → ${newProgress}%`];
            } else {
                [action, description] = ['task.remark_added', `Added a remark on "${task.title}"`];
            }
            await logActivity(
                action,
                description,
                { type: 'task', id: task.id },
                { old_status: oldStatus, new_status: newStatus, old_progress: oldProgress, new_progress: newProgress },
                actor.id,
            );

            // Every update is notified. People @mentioned in the remark get the mention instead.
            const info = await loadTaskInfo(task.id);
            const mentioned = remark !== null ? (await Notify.mentions(remark, info, { type: 'task_update', id: update.id }, actor)).filter((id) => id !== actor.id) : [];
            if (statusChanged && newStatus === 'completed') {
                await Notify.taskCompleted(info, actor, remark, mentioned);
            } else {
                await Notify.taskUpdated(
                    info,
                    actor,
                    { status: statusChanged ? TaskStatus.label(newStatus) : null, progress: progressChanged ? newProgress : null, remark },
                    mentioned,
                );
            }

            await TaskService.afterChange(task.id, actor);

            return update;
        });
    },

    /* ============================================================== Edit details */

    /** Update editable details (title, description, priority, dates, assignee). */
    async updateDetails(taskId: number, data: DetailsData, actor: Actor): Promise<TaskRow> {
        return transaction(async () => {
            const task = await findTask(taskId);
            if (!task) throw new Error('Task not found');

            const fieldNames: Record<keyof DetailsData, string> = {
                title: 'title',
                description: 'description',
                category: 'type',
                priority: 'priority',
                startDate: 'start_date',
                dueDate: 'due_date',
                assigneeId: 'assignee_id',
            };

            const changes: Record<string, { old: unknown; new: unknown }> = {};
            const values: Partial<TaskRow> = {};
            for (const key of Object.keys(fieldNames) as (keyof DetailsData)[]) {
                if (!(key in data)) continue;
                const next = data[key] ?? null;
                const previous = task[key] ?? null;
                if (String(previous ?? '') !== String(next ?? '')) {
                    changes[fieldNames[key]] = { old: previous, new: next };
                    (values as Record<string, unknown>)[key] = next;
                }
            }

            if (!Object.keys(changes).length) return task;

            const at = now();
            await saveTask(task.id, { ...values, latestUpdateAt: at, latestUpdateBy: actor.id });
            const title = values.title ?? task.title;

            const { assignee_id: assigneeChange, ...detailChanges } = changes;
            if (Object.keys(detailChanges).length) {
                await record(task.id, actor.id, 'details', null, null, null, null, null, { changes: detailChanges });
                await logActivity('task.updated', `Edited "${title}" (${Object.keys(detailChanges).join(', ')})`, { type: 'task', id: task.id }, { changes: detailChanges }, actor.id);
                await Notify.taskEdited(
                    await loadTaskInfo(task.id),
                    actor,
                    Object.keys(detailChanges).map((field) => field.replace(/_/g, ' ')),
                );
            }

            if (assigneeChange) {
                const ids = [assigneeChange.old, assigneeChange.new].filter((id): id is number => typeof id === 'number');
                const names = new Map(
                    ids.length ? (await db().select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name]) : [],
                );
                const oldId = (assigneeChange.old as number | null) ?? null;
                const newId = (assigneeChange.new as number | null) ?? null;
                await record(task.id, actor.id, 'assignment', null, null, null, null, null, {
                    old_assignee_id: oldId,
                    old_assignee: oldId ? (names.get(oldId) ?? null) : null,
                    new_assignee_id: newId,
                    new_assignee: newId ? (names.get(newId) ?? null) : null,
                });
                await logActivity(
                    'task.assigned',
                    newId ? `Assigned "${title}" to ${names.get(newId)}` : `Unassigned "${title}"`,
                    { type: 'task', id: task.id },
                    { old_assignee_id: oldId, new_assignee_id: newId },
                    actor.id,
                );

                if (newId) {
                    // A person can't be both the primary assignee and a collaborator.
                    await db().delete(taskCollaborators).where(and(eq(taskCollaborators.taskId, task.id), eq(taskCollaborators.userId, newId)));
                    if (newId !== actor.id) await Notify.taskAssigned(await loadTaskInfo(task.id), newId, actor);
                }
            }

            if (changes.due_date) {
                await TaskService.syncDelay((await findTask(task.id))!);
            }

            await TaskService.afterChange(task.id, actor);

            return (await findTask(task.id))!;
        });
    },

    /* ============================================================== Collaborators */

    async addCollaborator(taskId: number, userId: number, actor: Actor): Promise<boolean> {
        const task = await findTask(taskId);
        if (!task || task.assigneeId === userId) return false;
        // Administrators and executives see every task already; they are never collaborators.
        if (await isFullAccessUser(userId)) return false;

        const [user] = await db().select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
        if (!user) return false;

        const inserted = await db()
            .insert(taskCollaborators)
            .values({ taskId, userId, addedBy: actor.id, createdAt: now(), updatedAt: now() })
            .onConflictDoNothing()
            .returning({ id: taskCollaborators.id });
        if (!inserted.length) return false;

        await logActivity('collaborator.added', `Added ${user.name} as collaborator on "${task.title}"`, { type: 'task', id: task.id }, { user_id: user.id }, actor.id);
        if (user.id !== actor.id) await Notify.collaboratorAdded(await loadTaskInfo(task.id), user.id, actor);

        return true;
    },

    async removeCollaborator(taskId: number, userId: number, actor: Actor): Promise<boolean> {
        const task = await findTask(taskId);
        if (!task) return false;
        const removed = await db()
            .delete(taskCollaborators)
            .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)))
            .returning({ id: taskCollaborators.id });
        if (removed.length) {
            const [user] = await db().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
            await logActivity('collaborator.removed', `Removed ${user?.name ?? 'a user'} from "${task.title}"`, { type: 'task', id: task.id }, { user_id: userId }, actor.id);
        }
        return removed.length > 0;
    },

    /* ============================================================== Delete */

    async delete(taskId: number, actor: Actor): Promise<void> {
        await transaction(async () => {
            const task = await findTask(taskId);
            if (!task) return;
            const [project] = task.projectId
                ? await db().select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, task.projectId)).limit(1)
                : [];

            const at = now();
            await db().update(tasks).set({ deletedAt: at, updatedAt: at }).where(eq(tasks.id, task.id));

            await logActivity(
                'task.deleted',
                `Deleted task "${task.title}"${project ? ` from ${project.name}` : ''}`,
                { type: 'task', id: task.id },
                { project_id: task.projectId },
                actor.id,
            );

            if (task.projectId) await ProjectHealthService.refresh(task.projectId);
        });
    },

    /* ============================================================== Delay handling */

    shouldBeDelayed,

    /**
     * Apply or clear the automatic Delayed status based on the due date.
     * Returns true if the status changed.
     */
    async syncDelay(task: TaskRow): Promise<boolean> {
        const status = task.status as TaskStatus;

        if (canAutoDelay(status) && (await shouldBeDelayed(task))) {
            await transaction(async () => {
                await saveTask(task.id, { statusBeforeDelay: status, status: 'delayed', delayedAt: now() });
                await record(task.id, null, 'auto_delayed', status, 'delayed', task.progress, task.progress, null, { due_date: task.dueDate });
                await logActivity('task.delayed', `"${task.title}" was automatically marked Delayed (due ${formatDate(task.dueDate, 'M j, Y')})`, { type: 'task', id: task.id }, {}, null);
                await Notify.taskDelayed(await loadTaskInfo(task.id));
            });
            return true;
        }

        // Rescheduled → restore the progress-driven status. Only reached after a due-date change,
        // so a manually chosen Delayed status is not cleared by the periodic check.
        if (status === 'delayed' && task.delayedAt !== null && !(await shouldBeDelayed(task))) {
            const restored = statusFromProgress(Math.min(task.progress, 99));
            await saveTask(task.id, { status: restored, statusBeforeDelay: null, delayedAt: null });
            await record(task.id, null, 'undelayed', 'delayed', restored, task.progress, task.progress, null, { due_date: task.dueDate });
            return true;
        }

        return false;
    },

    /* ============================================================== After a change */

    async afterChange(taskId: number, actor: Actor | null = null): Promise<void> {
        const [task] = await db().select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
        if (task?.projectId) await ProjectHealthService.refresh(task.projectId);
    },
};

/* ============================================================== Internals */

async function shouldBeDelayed(task: Pick<TaskRow, 'dueDate'>): Promise<boolean> {
    return (await Settings.bool('deadline.auto_delay_enabled')) && task.dueDate !== null && task.dueDate < today();
}

export function clampProgress(value: number | string | null | undefined): number {
    const n = Math.trunc(Number(value ?? 0)) || 0;
    return Math.max(0, Math.min(100, n));
}

/** Make status and progress agree with each other. */
export function normalize(status: TaskStatus, progress: number): [TaskStatus, number] {
    switch (status) {
        case 'pending':
            return [status, 0];
        case 'completed':
            return [status, 100];
        case 'in_progress':
            return [status, Math.max(1, Math.min(99, progress))];
        default:
            return [status, progress];
    }
}

export function resolve(oldStatus: TaskStatus, oldProgress: number, status: TaskStatus | null, progress: number | null): [TaskStatus, number] {
    // Explicit status wins; progress adjusted to match.
    if (status !== null) return normalize(status, progress ?? oldProgress);
    if (progress === null) return [oldStatus, oldProgress];

    // Progress only.
    switch (oldStatus) {
        case 'pending':
        case 'in_progress':
        case 'completed':
            return [statusFromProgress(progress), progress];
        case 'delayed':
        case 'on_hold':
            return [progress >= 100 ? 'completed' : oldStatus, progress];
        default:
            return [oldStatus, progress];
    }
}

function statusSideFields(task: TaskRow, newStatus: TaskStatus, oldStatus: TaskStatus, beforeDelay: TaskStatus | null): Partial<TaskRow> {
    const fields: Partial<TaskRow> = {
        completedAt: newStatus === 'completed' ? (task.completedAt ?? now()) : null,
    };
    if (newStatus === 'delayed') {
        if (oldStatus !== 'delayed') {
            fields.delayedAt = now();
            fields.statusBeforeDelay = beforeDelay ?? oldStatus;
        }
    } else {
        fields.delayedAt = null;
        fields.statusBeforeDelay = null;
    }
    return fields;
}

async function record(
    taskId: number,
    actorId: number | null,
    type: string,
    oldStatus: TaskStatus | null = null,
    newStatus: TaskStatus | null = null,
    oldProgress: number | null = null,
    newProgress: number | null = null,
    remark: string | null = null,
    meta: Record<string, unknown> = {},
) {
    const at = now();
    const [row] = await db()
        .insert(taskUpdates)
        .values({
            taskId,
            userId: actorId,
            type,
            oldStatus,
            newStatus,
            oldProgress,
            newProgress,
            remark,
            meta: Object.keys(meta).length ? meta : null,
            createdAt: at,
            updatedAt: at,
        })
        .returning();
    return row;
}

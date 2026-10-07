import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { formatDate, now } from './dates';
import type { NotificationType } from './enums';
import { routes } from './urls';
import { firstName } from './users';
import { taskAccess, usersWhoCanViewTask } from './access';
import type { Subject as ActivitySubject } from './activity';

/*
 * In-app notifications. The acting user is never notified about their own action, and
 * deactivated accounts are skipped.
 */

export type ActorInfo = { id: number; name: string } | null;

/** The task facts notifications are written from. */
export type TaskInfo = {
    id: number;
    title: string;
    /** Null for standalone tasks. */
    projectId: number | null;
    projectName: string | null;
    projectOwnerId: number | null;
    assigneeId: number | null;
    createdBy: number;
    dueDate: string | null;
    progress: number;
};

export async function loadTaskInfo(taskId: number): Promise<TaskInfo> {
    const [row] = await db()
        .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            projectId: schema.tasks.projectId,
            projectName: schema.projects.name,
            projectOwnerId: schema.projects.ownerId,
            assigneeId: schema.tasks.assigneeId,
            createdBy: schema.tasks.createdBy,
            dueDate: schema.tasks.dueDate,
            progress: schema.tasks.progress,
        })
        .from(schema.tasks)
        .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
        .where(eq(schema.tasks.id, taskId))
        .limit(1);
    if (!row) throw new Error(`Task ${taskId} not found`);
    return row;
}

/** "Project: Website" or "Standalone task" — the context line under a task notification. */
const where = (task: TaskInfo) => (task.projectName ? `Project: ${task.projectName}` : 'Standalone task');

async function collaboratorIds(taskId: number): Promise<number[]> {
    const rows = await db().select({ id: schema.taskCollaborators.userId }).from(schema.taskCollaborators).where(eq(schema.taskCollaborators.taskId, taskId));
    return rows.map((r) => r.id);
}

const snippet = (text: string, length = 160) => {
    const plain = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return plain.length > length ? `${plain.slice(0, length)}…` : plain;
};

/**
 * Everyone involved in a task — creator/assignee, collaborators and the project owner — minus
 * `exclude` (people already notified about the same change, e.g. by an @mention).
 */
async function involvedIds(task: TaskInfo, exclude: number[] = []): Promise<number[]> {
    const skip = new Set(exclude);
    const ids = [...new Set([...(await stakeholderIds(task)), task.projectOwnerId].filter((id): id is number => !!id && !skip.has(id)))];
    // The project owner may be in another department and unable to open the task.
    const access = await taskAccess(task.id);
    return access ? usersWhoCanViewTask(ids, access) : ids;
}

/** Assignee, creator and collaborators — the people who care about a task. */
export async function stakeholderIds(task: Pick<TaskInfo, 'id' | 'assigneeId' | 'createdBy'>): Promise<number[]> {
    return [...new Set([task.assigneeId, task.createdBy, ...(await collaboratorIds(task.id))].filter((id): id is number => !!id))];
}

export async function sendNotification(options: {
    recipients: (number | null | undefined)[];
    type: NotificationType;
    title: string;
    message?: string | null;
    url?: string | null;
    subject?: ActivitySubject;
    data?: Record<string, unknown>;
    actor?: ActorInfo;
    notifyActor?: boolean;
}): Promise<number> {
    let ids = [...new Set(options.recipients.filter((r): r is number => !!r))];
    if (!options.notifyActor && options.actor) ids = ids.filter((id) => id !== options.actor!.id);
    if (!ids.length) return 0;

    const active = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(inArray(schema.users.id, ids), eq(schema.users.isActive, true)));
    if (!active.length) return 0;

    const title = options.title.length > 250 ? `${options.title.slice(0, 247)}...` : options.title;
    const at = now();
    await db()
        .insert(schema.notifications)
        .values(
            active.map(({ id }) => ({
                userId: id,
                actorId: options.actor?.id ?? null,
                type: options.type,
                title,
                message: options.message ?? null,
                url: options.url ?? null,
                subjectType: options.subject?.type ?? null,
                subjectId: options.subject?.id ?? null,
                data: options.data && Object.keys(options.data).length ? options.data : null,
                createdAt: at,
                updatedAt: at,
            })),
        );
    return active.length;
}

const who = (actor: ActorInfo) => (actor ? firstName(actor.name) : 'Someone');

export const Notify = {
    async taskAssigned(task: TaskInfo, assigneeId: number, actor: ActorInfo) {
        await sendNotification({
            recipients: [assigneeId],
            type: 'task_assigned',
            title: `${who(actor)} assigned you "${task.title}"`,
            message: `${where(task)}${task.dueDate ? ` · Due ${formatDate(task.dueDate, 'M j, Y')}` : ''}`,
            url: routes.task(task.id),
            subject: { type: 'task', id: task.id },
            actor,
        });
    },

    async collaboratorAdded(task: TaskInfo, userId: number, actor: ActorInfo) {
        await sendNotification({
            recipients: [userId],
            type: 'collaborator_added',
            title: `${who(actor)} added you as a collaborator on "${task.title}"`,
            message: where(task),
            url: routes.task(task.id),
            subject: { type: 'task', id: task.id },
            actor,
        });
    },

    async projectMemberAdded(project: { id: number; name: string }, userId: number, actor: ActorInfo) {
        await sendNotification({
            recipients: [userId],
            type: 'project_member_added',
            title: `${who(actor)} added you to the project "${project.name}"`,
            url: routes.project(project.id),
            subject: { type: 'project', id: project.id },
            actor,
        });
    },

    /** The project's owner and managers hear about a new suggestion (not the person who wrote it). */
    async suggestionAdded(project: { id: number; name: string }, recipients: number[], suggestionId: number, body: string, actor: ActorInfo) {
        await sendNotification({
            recipients,
            type: 'suggestion_added',
            title: `${who(actor)} left a suggestion on "${project.name}"`,
            message: snippet(body),
            url: routes.project(project.id),
            subject: { type: 'project_suggestion', id: suggestionId },
            actor,
        });
    },

    /** The whole team hears that the project shipped; post-launch work is logged from now on. */
    async projectCompleted(project: { id: number; name: string }, memberIds: number[], actor: ActorInfo) {
        await sendNotification({
            recipients: memberIds,
            type: 'project_completed',
            title: `"${project.name}" was marked completed`,
            message: `${actor ? `By ${actor.name} · ` : ''}Log enhancements, bug fixes and updates on the project page.`,
            url: routes.project(project.id),
            subject: { type: 'project', id: project.id },
            actor,
            notifyActor: true,
        });
    },

    /*
     * Task activity. Every update reaches everyone involved in the task — including the person who
     * made it, so the notification list doubles as the task's activity feed.
     */

    async taskCompleted(task: TaskInfo, actor: ActorInfo, remark: string | null = null, exclude: number[] = []) {
        await sendNotification({
            recipients: await involvedIds(task, exclude),
            type: 'task_completed',
            title: `"${task.title}" was completed`,
            message: remark ? `${who(actor)}: “${snippet(remark)}”` : `${actor ? `Completed by ${actor.name} · ` : ''}${where(task)}`,
            url: routes.task(task.id),
            subject: { type: 'task', id: task.id },
            actor,
            notifyActor: true,
        });
    },

    /** Status, progress and/or a remark. */
    async taskUpdated(task: TaskInfo, actor: ActorInfo, change: { status: string | null; progress: number | null; remark: string | null }, exclude: number[] = []) {
        const parts = [change.status, change.progress !== null ? `${change.progress}%` : null].filter(Boolean);
        const summary = parts.length ? parts.join(' · ') : null;
        await sendNotification({
            recipients: await involvedIds(task, exclude),
            type: 'task_updated',
            title: summary ? `${who(actor)} updated "${task.title}" — ${summary}` : `${who(actor)} added a remark on "${task.title}"`,
            message: change.remark ? `“${snippet(change.remark)}”` : where(task),
            url: routes.task(task.id),
            subject: { type: 'task', id: task.id },
            actor,
            notifyActor: true,
        });
    },

    /** Title, description, priority or dates changed. */
    async taskEdited(task: TaskInfo, actor: ActorInfo, fields: string[]) {
        await sendNotification({
            recipients: await involvedIds(task),
            type: 'task_updated',
            title: `${who(actor)} edited "${task.title}"`,
            message: `Changed ${fields.join(', ')} · ${where(task)}`,
            url: routes.task(task.id),
            subject: { type: 'task', id: task.id },
            actor,
            notifyActor: true,
        });
    },

    async commentAdded(task: TaskInfo, actor: ActorInfo, commentId: number, body: string, exclude: number[] = []) {
        await sendNotification({
            recipients: await involvedIds(task, exclude),
            type: 'comment_added',
            title: `${who(actor)} commented on "${task.title}"`,
            message: snippet(body),
            url: routes.task(task.id),
            subject: { type: 'task_comment', id: commentId },
            actor,
            notifyActor: true,
        });
    },

    async attachmentAdded(task: TaskInfo, actor: ActorInfo, attachmentId: number, fileName: string) {
        await sendNotification({
            recipients: await involvedIds(task),
            type: 'attachment_added',
            title: `${who(actor)} attached a file to "${task.title}"`,
            message: fileName,
            url: routes.task(task.id),
            subject: { type: 'attachment', id: attachmentId },
            actor,
            notifyActor: true,
        });
    },

    async taskDelayed(task: TaskInfo) {
        await sendNotification({
            recipients: [...(await stakeholderIds(task)), task.projectOwnerId],
            type: 'task_delayed',
            title: `"${task.title}" is now delayed`,
            message: `It was due ${task.dueDate ? formatDate(task.dueDate, 'M j, Y') : ''} · ${where(task)}`,
            url: routes.task(task.id),
            subject: { type: 'task', id: task.id },
            actor: null,
        });
    },

    async deadlineApproaching(task: TaskInfo, dueLabel: string) {
        await sendNotification({
            recipients: [task.assigneeId, ...(await collaboratorIds(task.id))],
            type: 'deadline_approaching',
            title: `"${task.title}" — ${dueLabel.toLowerCase()}`,
            message: `Progress: ${task.progress}% · ${where(task)}`,
            url: routes.task(task.id),
            subject: { type: 'task', id: task.id },
            data: { due_date: task.dueDate },
            actor: null,
        });
    },

    /**
     * Notify users @mentioned in a comment or remark ("@jane.doe"). Only people who can actually
     * open the task are notified. Returns the ids of the users notified.
     */
    async mentions(text: string, task: TaskInfo, subject: ActivitySubject | null, actor: ActorInfo): Promise<number[]> {
        const mentioned = await parseMentions(text);
        if (!mentioned.length) return [];
        const access = await taskAccess(task.id);
        if (!access) return [];
        const allowed = await usersWhoCanViewTask(mentioned, access);
        if (!allowed.length) return [];

        const plain = text.replace(/<[^>]*>/g, '');
        await sendNotification({
            recipients: allowed,
            type: 'mentioned',
            title: `${who(actor)} mentioned you on "${task.title}"`,
            message: plain.length > 160 ? `${plain.slice(0, 160)}...` : plain,
            url: routes.task(task.id),
            subject: subject ?? { type: 'task', id: task.id },
            actor,
        });
        return allowed;
    },
};

/** Active users mentioned in the text by username. */
export async function parseMentions(text: string): Promise<number[]> {
    const usernames = [...new Set([...text.matchAll(/(?<![\w.])@([a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9])/gi)].map((m) => m[1].toLowerCase()))];
    if (!usernames.length) return [];
    const rows = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.isActive, true), inArray(sql`lower(${schema.users.username})`, usernames)));
    return rows.map((r) => r.id);
}

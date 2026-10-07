'use server';

import { and, eq } from 'drizzle-orm';
import { forbidden, notFound, redirect } from 'next/navigation';
import { can, projectAccess, taskAccess, type TaskAccess } from '@/lib/access';
import { logActivity } from '@/lib/activity';
import { requireUser, type CurrentUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { now } from '@/lib/dates';
import { Priority, TaskCategory, TaskStatus } from '@/lib/enums';
import { ValidationError } from '@/lib/errors';
import { done, flash } from '@/lib/flash';
import { loadTaskInfo, Notify } from '@/lib/notifications';
import { TaskService } from '@/lib/services/tasks';
import { canBeAssigned, isFullAccessUser } from '@/lib/users';
import { ALLOWED_EXTENSIONS, blobEnabled, blobHead, deleteStoredFile, detectType, MAX_ATTACHMENT_BYTES, saveLocal } from '@/lib/storage';
import { Validator, type FormState } from '@/lib/validation';

/* ------------------------------------------------------------------ helpers */

async function accessOr404(taskId: number): Promise<TaskAccess> {
    const access = await taskAccess(taskId);
    if (!access) notFound();
    return access;
}

async function activeUserExists(id: number): Promise<boolean> {
    const rows = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.id, id), eq(schema.users.isActive, true)))
        .limit(1);
    return rows.length > 0;
}

/** "project" (the default) or "standalone" — short-term work that doesn't belong to a project. */
function readKind(v: Validator): 'project' | 'standalone' {
    return v.oneOf('kind', ['project', 'standalone']) === 'standalone' ? 'standalone' : 'project';
}

function validationState(v: Validator, error: unknown): FormState {
    if (error instanceof ValidationError) return v.state(error.errors);
    throw error;
}

/* ------------------------------------------------------------------ create / edit / delete */

export async function createTaskAction(_: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const v = new Validator(formData);
    const standalone = readKind(v) === 'standalone';
    const projectId = standalone ? null : v.int('project_id');
    const title = v.string('title', { required: true, max: 255 });
    const description = v.string('description', { max: 10000, keepWhitespace: true });
    // Only used when the project is completed (post-launch item); ignored otherwise.
    const category = v.oneOf('category', TaskCategory.values);
    const priority = v.oneOf('priority', Priority.values, { required: true });
    // Defaults to the creator when left empty.
    const assigneeId = v.int('assignee_id') ?? user.id;
    const startDate = v.date('start_date');
    const dueDate = v.date('due_date', { afterOrEqual: 'start_date' });
    const status = v.oneOf('status', TaskStatus.values);
    const progress = v.int('progress', { min: 0, max: 100 });
    const collaboratorIds = v.ints('collaborator_ids[]');

    if (!standalone && !projectId) v.fail('project_id', 'Please choose a project, or make this a standalone task.');
    if (!(await canBeAssigned(assigneeId, user.id))) v.fail('assignee_id', 'Choose someone from the list.');
    if (v.fails()) return v.state();

    if (!standalone) {
        const project = await projectAccess(projectId!);
        if (!project) return v.state({ project_id: 'The selected project id is invalid.' });
        if (!can.createTask(user, project)) forbidden();
    }

    let taskId: number;
    try {
        const task = await TaskService.create(
            { projectId, title: title!, description, category, priority, assigneeId, startDate, dueDate, status, progress, collaboratorIds },
            user,
        );
        taskId = task.id;
    } catch (error) {
        return validationState(v, error);
    }

    await flash('success', 'Task created.');
    redirect(`/tasks/${taskId}`);
}

export async function updateTaskAction(taskId: number, _: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.editTask(user, access)) forbidden();

    const v = new Validator(formData);
    const title = v.string('title', { required: true, max: 255 });
    const description = v.string('description', { max: 10000, keepWhitespace: true });
    const category = v.oneOf('category', TaskCategory.values);
    const priority = v.oneOf('priority', Priority.values, { required: true });
    const assigneeId = v.int('assignee_id', { required: true, label: 'assignee' });
    const startDate = v.date('start_date');
    const dueDate = v.date('due_date', { afterOrEqual: 'start_date' });
    if (assigneeId && !(await canBeAssigned(assigneeId, user.id, access.assigneeId))) v.fail('assignee_id', 'Choose someone from the list.');
    if (v.fails()) return v.state();

    // A post-launch item can switch type (enhancement ⇄ bug fix ⇄ update); a build task stays one.
    const [current] = await db().select({ category: schema.tasks.category }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
    const nextCategory = current?.category && category ? { category } : {};

    await TaskService.updateDetails(taskId, { title: title!, description, ...nextCategory, priority: priority!, assigneeId, startDate, dueDate }, user);

    await flash('success', 'Task details updated.');
    redirect(`/tasks/${taskId}`);
}

export async function deleteTaskAction(taskId: number): Promise<void> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.deleteTask(user, access)) forbidden();

    await TaskService.delete(taskId, user);
    await flash('success', 'Task deleted.');
    redirect('/tasks');
}

/* ------------------------------------------------------------------ quick update & quick create */

/** Status / progress / remark update; history is append-only. */
export async function quickUpdateAction(taskId: number, _: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.updateTask(user, access)) forbidden();

    const v = new Validator(formData);
    const status = v.oneOf('status', TaskStatus.values);
    const progress = v.int('progress', { min: 0, max: 100 });
    const remark = v.string('remark', { max: 2000, keepWhitespace: true });
    if (v.fails()) return v.state();

    await TaskService.applyUpdate(taskId, user, status, progress, remark);
    await done('success', 'Task updated.');
    return { ok: true };
}

/** The global "n" quick create: title + project or standalone (+ due date, priority). */
export async function quickCreateAction(_: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const v = new Validator(formData);
    const title = v.string('title', { required: true, max: 255 });
    const standalone = readKind(v) === 'standalone';
    const projectId = standalone ? null : v.int('project_id');
    const dueDate = v.date('due_date');
    const priority = v.oneOf('priority', Priority.values);
    if (!standalone && !projectId) v.fail('project_id', 'Please choose a project, or make this a standalone task.');
    if (v.fails()) return v.state();

    if (projectId) {
        const project = await projectAccess(projectId);
        if (!project) return v.state({ project_id: 'The selected project id is invalid.' });
        if (!can.createTask(user, project)) forbidden();
    }

    const task = await TaskService.create({ projectId, title: title!, dueDate, priority, assigneeId: user.id }, user);
    await flash('success', 'Task created.');
    redirect(`/tasks/${task.id}`);
}

/* ------------------------------------------------------------------ focus */

/** Pin or unpin a task as one of *your* priorities (Focus of the Day). Personal to each user. */
export async function toggleFocusAction(taskId: number): Promise<void> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.viewTask(user, access)) forbidden();

    const removed = await db()
        .delete(schema.taskFocus)
        .where(and(eq(schema.taskFocus.userId, user.id), eq(schema.taskFocus.taskId, taskId)))
        .returning({ id: schema.taskFocus.id });
    if (!removed.length) {
        await db().insert(schema.taskFocus).values({ userId: user.id, taskId, createdAt: now() }).onConflictDoNothing();
    }
    await done('success', removed.length ? 'Removed from your Focus of the Day.' : 'Added to your Focus of the Day.');
}

/* ------------------------------------------------------------------ collaborators */

export async function addCollaboratorAction(taskId: number, _: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.manageCollaborators(user, access)) forbidden();

    const v = new Validator(formData);
    const userId = v.int('user_id', { required: true, label: 'person' });
    if (v.fails()) return v.state();
    if (!(await activeUserExists(userId!))) return v.state({ user_id: 'The selected person is invalid.' });
    if (await isFullAccessUser(userId!)) {
        return v.state({ user_id: 'Administrators and executives can’t be collaborators — they already have access to every task.' });
    }

    if (!(await TaskService.addCollaborator(taskId, userId!, user))) {
        await done('warning', 'That user is already a collaborator or the assignee.');
        return { ok: false };
    }
    await done('success', 'Collaborator added.');
    return { ok: true };
}

export async function removeCollaboratorAction(taskId: number, userId: number): Promise<void> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.manageCollaborators(user, access)) forbidden();
    if (!access.collaboratorIds.has(userId)) notFound();

    await TaskService.removeCollaborator(taskId, userId, user);
    await done('success', 'Collaborator removed.');
}

/* ------------------------------------------------------------------ comments */

export async function addCommentAction(taskId: number, _: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.comment(user, access)) forbidden();

    const v = new Validator(formData);
    const body = v.string('body', { required: true, max: 10000 });
    if (v.fails()) return v.state();

    const [comment] = await db()
        .insert(schema.taskComments)
        .values({ taskId, userId: user.id, body: body!, createdAt: now(), updatedAt: now() })
        .returning();
    const info = await loadTaskInfo(taskId);
    await logActivity('comment.added', `${user.name} commented on "${info.title}"`, { type: 'task', id: taskId }, {}, user.id);
    // Mentioned people get the mention; everyone else involved gets "new comment".
    const mentioned = (await Notify.mentions(comment.body, info, { type: 'task_comment', id: comment.id }, user)).filter((id) => id !== user.id);
    await Notify.commentAdded(info, user, comment.id, comment.body, mentioned);

    await done('success', 'Comment added.');
    return { ok: true };
}

export async function deleteCommentAction(commentId: number): Promise<void> {
    const user = await requireUser();
    const [comment] = await db().select().from(schema.taskComments).where(eq(schema.taskComments.id, commentId));
    if (!comment) notFound();
    const access = await accessOr404(comment.taskId);
    if (!(can.comment(user, access) && (comment.userId === user.id || can.editTask(user, access)))) forbidden();

    const info = await loadTaskInfo(comment.taskId);
    await logActivity('comment.deleted', `${user.name} deleted a comment on "${info.title}"`, { type: 'task', id: comment.taskId }, { comment_id: comment.id }, user.id);
    await db().delete(schema.taskComments).where(eq(schema.taskComments.id, commentId));
    await done('success', 'Comment deleted.');
}

/* ------------------------------------------------------------------ attachments */

async function recordAttachment(user: CurrentUser, taskId: number, data: { originalName: string; path: string; disk: string; mimeType: string; size: number }) {
    const [attachment] = await db()
        .insert(schema.attachments)
        .values({ attachableType: 'task', attachableId: taskId, userId: user.id, ...data, createdAt: now(), updatedAt: now() })
        .returning();
    const info = await loadTaskInfo(taskId);
    await logActivity('attachment.uploaded', `${user.name} uploaded "${attachment.originalName}" to "${info.title}"`, { type: 'task', id: taskId }, { attachment_id: attachment.id }, user.id);
    await Notify.attachmentAdded(info, user, attachment.id, attachment.originalName);
}

const TYPE_ERROR = `The file field must be a file of type: ${ALLOWED_EXTENSIONS.join(', ')}.`;
const SIZE_ERROR = 'The file field must not be greater than 10240 kilobytes.';

/** Local storage: the file comes through the action itself (no Blob store configured). */
export async function uploadAttachmentAction(taskId: number, _: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.comment(user, access)) forbidden();

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { errors: { file: 'The file field is required.' } };
    if (file.size > MAX_ATTACHMENT_BYTES) return { errors: { file: SIZE_ERROR } };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = await detectType(bytes.slice(0, 4100), file.name);
    if (!mimeType) return { errors: { file: TYPE_ERROR } };

    const filePath = await saveLocal(`task-${taskId}`, file.name, bytes);
    await recordAttachment(user, taskId, { originalName: file.name.slice(0, 255), path: filePath, disk: 'local', mimeType, size: file.size });
    await done('success', 'Attachment uploaded.');
    return { ok: true };
}

/**
 * Vercel Blob: the browser has already uploaded the file (with a token from
 * /api/attachments/upload, which checked permission and pinned the path to this task).
 * Verify the stored content, then record it.
 */
export async function registerBlobAttachmentAction(taskId: number, upload: { pathname: string; originalName: string }): Promise<FormState> {
    const user = await requireUser();
    const access = await accessOr404(taskId);
    if (!can.comment(user, access)) forbidden();
    if (!blobEnabled() || !upload.pathname.startsWith(`attachments/task-${taskId}/`)) return { errors: { file: 'The upload could not be verified.' } };

    const stored = await blobHead(upload.pathname);
    if (!stored) return { errors: { file: 'The upload could not be found. Please try again.' } };

    const mimeType = await detectType(stored.head, upload.originalName);
    if (!mimeType || stored.size > MAX_ATTACHMENT_BYTES) {
        await deleteStoredFile('blob', upload.pathname);
        return { errors: { file: mimeType ? SIZE_ERROR : TYPE_ERROR } };
    }

    await recordAttachment(user, taskId, { originalName: upload.originalName.slice(0, 255), path: upload.pathname, disk: 'blob', mimeType, size: stored.size });
    await done('success', 'Attachment uploaded.');
    return { ok: true };
}

export async function deleteAttachmentAction(attachmentId: number): Promise<void> {
    const user = await requireUser();
    const [attachment] = await db().select().from(schema.attachments).where(eq(schema.attachments.id, attachmentId));
    if (!attachment || attachment.attachableType !== 'task') notFound();
    const access = await accessOr404(attachment.attachableId);
    if (!(can.comment(user, access) && (attachment.userId === user.id || can.editTask(user, access)))) forbidden();

    const info = await loadTaskInfo(attachment.attachableId);
    await logActivity('attachment.deleted', `${user.name} deleted "${attachment.originalName}" from "${info.title}"`, { type: 'task', id: info.id }, { attachment_id: attachment.id }, user.id);
    await db().delete(schema.attachments).where(eq(schema.attachments.id, attachmentId));
    await deleteStoredFile(attachment.disk, attachment.path);
    await done('success', 'Attachment deleted.');
}

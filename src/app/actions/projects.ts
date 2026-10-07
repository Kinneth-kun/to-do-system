'use server';

import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { forbidden, notFound, redirect } from 'next/navigation';
import { can, isProjectMember, projectAccess, type ProjectAccess } from '@/lib/access';
import { logActivity } from '@/lib/activity';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { now } from '@/lib/dates';
import { Priority, PROJECT_COLORS, ProjectMemberRole, ProjectStatus } from '@/lib/enums';
import { done, flash } from '@/lib/flash';
import { Notify } from '@/lib/notifications';
import { ProjectService } from '@/lib/services/projects';
import { blobEnabled, blobHead, deleteStoredFile, detectType, saveLocal } from '@/lib/storage';
import { MAX_SUGGESTION_FILES, MAX_UPLOAD_BYTES, UPLOAD_SIZE_ERROR, UPLOAD_TYPE_ERROR } from '@/lib/upload-rules';
import { isFullAccessUser } from '@/lib/users';
import { Validator, type FormState } from '@/lib/validation';

async function accessOr404(projectId: number): Promise<ProjectAccess> {
    const access = await projectAccess(projectId);
    if (!access) notFound();
    return access;
}

async function existingUserIds(ids: number[]): Promise<number[]> {
    const result: number[] = [];
    for (const id of ids) {
        const [row] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
        if (row) result.push(row.id);
    }
    return result;
}

/** Shared rules for the project form. Status, priority and colour are optional on create. */
function readProject(v: Validator, required: boolean) {
    return {
        name: v.string('name', { required: true, max: 255 }),
        description: v.string('description', { max: 10000, keepWhitespace: true }),
        status: v.oneOf('status', ProjectStatus.values, { required }),
        priority: v.oneOf('priority', Priority.values, { required }),
        color: v.oneOf('color', PROJECT_COLORS, { required }),
        startDate: v.date('start_date'),
        dueDate: v.date('due_date', { afterOrEqual: 'start_date' }),
    };
}

export async function createProjectAction(_: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const v = new Validator(formData);
    const data = readProject(v, false);
    const memberIds = v.ints('member_ids[]');
    if (v.fails()) return v.state();

    const project = await ProjectService.create({ ...data, name: data.name!, memberIds: await existingUserIds(memberIds) }, user);
    await flash('success', 'Project created.');
    redirect(`/projects/${project.id}`);
}

export type InlineProjectState = { errors?: Record<string, string>; project?: { id: number; name: string; color: string; url: string } } | null;

/**
 * "Create a project without leaving the task form": returns the new project so the page can
 * select it in place (the JSON branch of ProjectController@store).
 */
export async function createProjectInlineAction(_: InlineProjectState, formData: FormData): Promise<InlineProjectState> {
    const user = await requireUser();
    const v = new Validator(formData);
    const data = readProject(v, false);
    if (v.fails()) return { errors: v.errors };

    const project = await ProjectService.create({ ...data, name: data.name! }, user);
    return { project: { id: project.id, name: project.name, color: project.color, url: `/projects/${project.id}` } };
}

export async function updateProjectAction(projectId: number, _: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const access = await accessOr404(projectId);
    if (!can.updateProject(user, access)) forbidden();

    const v = new Validator(formData);
    const data = readProject(v, true);
    // Only the owner (or an admin) sees the owner field; managers keep the current owner.
    const canTransfer = user.fullAccess || access.ownerId === user.id;
    const ownerId = canTransfer ? v.int('owner_id', { required: true, label: 'owner' }) : access.ownerId;
    if (canTransfer && ownerId && !(await existingUserIds([ownerId])).length) v.fail('owner_id', 'The selected owner is invalid.');
    if (v.fails()) return v.state();

    await ProjectService.update(projectId, { ...data, name: data.name!, ownerId: ownerId! }, user);
    await flash('success', 'Project updated.');
    redirect(`/projects/${projectId}`);
}

/** "Mark as completed" / "Reopen" on the project page. */
export async function setProjectCompletedAction(projectId: number, completed: boolean): Promise<void> {
    const user = await requireUser();
    const access = await accessOr404(projectId);
    if (!can.updateProject(user, access)) forbidden();

    await ProjectService.setStatus(projectId, completed ? 'completed' : 'active', user);
    await done('success', completed ? 'Project marked as completed. Log enhancements and fixes below.' : 'Project reopened.');
}

export async function deleteProjectAction(projectId: number): Promise<void> {
    const user = await requireUser();
    const access = await accessOr404(projectId);
    if (!can.deleteProject(user, access)) forbidden();

    await ProjectService.delete(projectId, user);
    await flash('success', 'Project deleted.');
    redirect('/projects');
}

/* ------------------------------------------------------------------ suggestions */

/**
 * Anyone who can see the project may leave a recommendation or suggestion on it. Reference files
 * are attached right after, one request per file (see attachSuggestionFileAction), so each stays
 * under the request size limit; `id` tells the browser where to attach them.
 */
export async function addSuggestionAction(projectId: number, _: FormState, formData: FormData): Promise<(NonNullable<FormState> & { id?: number }) | null> {
    const user = await requireUser();
    const access = await accessOr404(projectId);
    if (!can.viewProject(user, access)) forbidden();

    const v = new Validator(formData);
    const body = v.string('body', { required: true, max: 1000, label: 'suggestion' });
    if (v.fails()) return v.state();

    const [suggestion] = await db()
        .insert(schema.projectSuggestions)
        .values({ projectId, userId: user.id, body: body!, createdAt: now(), updatedAt: now() })
        .returning();
    const [project] = await db().select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.id, projectId));
    await logActivity('suggestion.added', `${user.name} suggested on "${project.name}": ${body}`, { type: 'project_suggestion', id: suggestion.id }, { project_id: projectId }, user.id);
    const managers = [access.ownerId, ...[...access.roles].filter(([, role]) => role === 'manager').map(([id]) => id)];
    await Notify.suggestionAdded(project, managers, suggestion.id, suggestion.body, user);

    await done('success', 'Thanks — your suggestion was added.');
    return { ok: true, id: suggestion.id };
}

/* Reference files (images, documents) on a suggestion: the author attaches them after posting. */

/** The suggestion, when the user wrote it, can still see its project, and it has room for another file. */
async function suggestionForUpload(suggestionId: number) {
    const user = await requireUser();
    const [suggestion] = await db().select().from(schema.projectSuggestions).where(eq(schema.projectSuggestions.id, suggestionId));
    if (!suggestion) notFound();
    const access = await accessOr404(suggestion.projectId);
    if (suggestion.userId !== user.id || !can.viewProject(user, access)) forbidden();
    const [{ files }] = await db()
        .select({ files: count() })
        .from(schema.attachments)
        .where(and(eq(schema.attachments.attachableType, 'project_suggestion'), eq(schema.attachments.attachableId, suggestionId)));
    return { user, suggestion, full: Number(files) >= MAX_SUGGESTION_FILES };
}

async function recordSuggestionFile(userId: number, suggestionId: number, data: { originalName: string; path: string; disk: string; mimeType: string; size: number }) {
    await db()
        .insert(schema.attachments)
        .values({ attachableType: 'project_suggestion', attachableId: suggestionId, userId, ...data, createdAt: now(), updatedAt: now() });
    revalidatePath('/projects');
}

const TOO_MANY_FILES = `A suggestion can have up to ${MAX_SUGGESTION_FILES} files.`;

/** Local storage: the file comes through the action itself (no Blob store configured). */
export async function attachSuggestionFileAction(suggestionId: number, formData: FormData): Promise<FormState> {
    const { user, full } = await suggestionForUpload(suggestionId);
    if (full) return { errors: { file: TOO_MANY_FILES } };

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { errors: { file: 'The file field is required.' } };
    if (file.size > MAX_UPLOAD_BYTES) return { errors: { file: UPLOAD_SIZE_ERROR } };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = await detectType(bytes.slice(0, 4100), file.name);
    if (!mimeType) return { errors: { file: UPLOAD_TYPE_ERROR } };

    const filePath = await saveLocal(`suggestion-${suggestionId}`, file.name, bytes);
    await recordSuggestionFile(user.id, suggestionId, { originalName: file.name.slice(0, 255), path: filePath, disk: 'local', mimeType, size: file.size });
    return { ok: true };
}

/** Vercel Blob: the browser already uploaded the file (token from /api/attachments/upload); verify and record it. */
export async function registerSuggestionBlobAction(suggestionId: number, upload: { pathname: string; originalName: string }): Promise<FormState> {
    const { user, full } = await suggestionForUpload(suggestionId);
    if (!blobEnabled() || !upload.pathname.startsWith(`attachments/suggestion-${suggestionId}/`)) return { errors: { file: 'The upload could not be verified.' } };
    if (full) {
        await deleteStoredFile('blob', upload.pathname);
        return { errors: { file: TOO_MANY_FILES } };
    }

    const stored = await blobHead(upload.pathname);
    if (!stored) return { errors: { file: 'The upload could not be found. Please try again.' } };
    const mimeType = await detectType(stored.head, upload.originalName);
    if (!mimeType || stored.size > MAX_UPLOAD_BYTES) {
        await deleteStoredFile('blob', upload.pathname);
        return { errors: { file: mimeType ? UPLOAD_SIZE_ERROR : UPLOAD_TYPE_ERROR } };
    }

    await recordSuggestionFile(user.id, suggestionId, { originalName: upload.originalName.slice(0, 255), path: upload.pathname, disk: 'blob', mimeType, size: stored.size });
    return { ok: true };
}

/** The author, the project's owner/managers, and administrators/executives can remove a suggestion. */
export async function deleteSuggestionAction(suggestionId: number): Promise<void> {
    const user = await requireUser();
    const [suggestion] = await db().select().from(schema.projectSuggestions).where(eq(schema.projectSuggestions.id, suggestionId));
    if (!suggestion) notFound();
    const access = await accessOr404(suggestion.projectId);
    if (!(can.viewProject(user, access) && (suggestion.userId === user.id || can.updateProject(user, access)))) forbidden();

    const files = and(eq(schema.attachments.attachableType, 'project_suggestion'), eq(schema.attachments.attachableId, suggestionId));
    const stored = await db().select({ disk: schema.attachments.disk, path: schema.attachments.path }).from(schema.attachments).where(files);
    await db().delete(schema.attachments).where(files);
    await db().delete(schema.projectSuggestions).where(eq(schema.projectSuggestions.id, suggestionId));
    for (const f of stored) await deleteStoredFile(f.disk, f.path);
    await logActivity('suggestion.deleted', `${user.name} removed a suggestion`, { type: 'project', id: suggestion.projectId }, { suggestion_id: suggestionId }, user.id);
    await done('success', 'Suggestion removed.');
}

/* ------------------------------------------------------------------ members */

export async function addMemberAction(projectId: number, _: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const access = await accessOr404(projectId);
    if (!can.manageMembers(user, access)) forbidden();

    const v = new Validator(formData);
    const userId = v.int('user_id', { required: true, label: 'person' });
    const role = v.oneOf('role', ProjectMemberRole.values) ?? 'member';
    if (v.fails()) return v.state();

    const [member] = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.id, userId!), eq(schema.users.isActive, true)))
        .limit(1);
    if (!member) return v.state({ user_id: 'The selected person is invalid.' });
    if (await isFullAccessUser(member.id)) {
        return v.state({ user_id: 'Administrators and executives can’t be project members — they already have access to every project.' });
    }

    await ProjectService.addMember(projectId, member.id, user, role);
    await done('success', 'Project member added.');
    return { ok: true };
}

export async function changeMemberRoleAction(projectId: number, userId: number, formData: FormData): Promise<void> {
    const user = await requireUser();
    const access = await accessOr404(projectId);
    if (!can.manageMembers(user, access)) forbidden();
    if (!isProjectMember(access, userId)) notFound();

    const role = String(formData.get('role'));
    if (!ProjectMemberRole.is(role)) return;
    await ProjectService.changeMemberRole(projectId, userId, role, user);
    await done('success', 'Member role updated.');
}

export async function removeMemberAction(projectId: number, userId: number): Promise<void> {
    const user = await requireUser();
    const access = await accessOr404(projectId);
    if (!can.manageMembers(user, access)) forbidden();
    if (!isProjectMember(access, userId)) notFound();

    if (!(await ProjectService.removeMember(projectId, userId, user))) {
        await done('warning', 'The project owner cannot be removed.');
        return;
    }
    await done('success', 'Project member removed.');
}

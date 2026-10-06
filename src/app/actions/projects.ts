'use server';

import { and, eq } from 'drizzle-orm';
import { forbidden, notFound, redirect } from 'next/navigation';
import { can, isProjectMember, projectAccess, type ProjectAccess } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { Priority, PROJECT_COLORS, ProjectMemberRole, ProjectStatus } from '@/lib/enums';
import { done, flash } from '@/lib/flash';
import { ProjectService } from '@/lib/services/projects';
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

export async function deleteProjectAction(projectId: number): Promise<void> {
    const user = await requireUser();
    const access = await accessOr404(projectId);
    if (!can.deleteProject(user, access)) forbidden();

    await ProjectService.delete(projectId, user);
    await flash('success', 'Project deleted.');
    redirect('/projects');
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

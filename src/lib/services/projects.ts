import { and, eq, isNull } from 'drizzle-orm';
import { db, schema, transaction } from '../db';
import { logActivity } from '../activity';
import { now } from '../dates';
import { PROJECT_COLORS, ProjectStatus, type Priority, type ProjectMemberRole, type ProjectStatus as ProjectStatusValue } from '../enums';
import { Notify } from '../notifications';
import { ProjectHealthService, type ProjectRow } from './health';
import type { Actor } from './tasks';

const { projects, projectMembers, tasks, users } = schema;

type ProjectData = {
    name: string;
    description?: string | null;
    ownerId?: number | null;
    status?: ProjectStatusValue | null;
    priority?: Priority | null;
    color?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    memberIds?: number[];
};

/** Idempotently add a user as a project member. Returns true if newly added. */
async function attachMember(projectId: number, userId: number, addedBy: number | null, role: ProjectMemberRole): Promise<boolean> {
    const rows = await db()
        .insert(projectMembers)
        .values({ projectId, userId, role, addedBy, createdAt: now(), updatedAt: now() })
        .onConflictDoNothing()
        .returning({ id: projectMembers.id });
    return rows.length > 0;
}

async function userName(id: number): Promise<string> {
    const [row] = await db().select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
    return row?.name ?? 'a user';
}

export async function findProject(id: number): Promise<ProjectRow | null> {
    const [row] = await db().select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt))).limit(1);
    return row ?? null;
}

export const ProjectService = {
    async create(data: ProjectData, actor: Actor): Promise<ProjectRow> {
        return transaction(async () => {
            const status = data.status ?? 'active';
            const at = now();
            const [project] = await db()
                .insert(projects)
                .values({
                    name: data.name,
                    description: data.description ?? null,
                    ownerId: data.ownerId ?? actor.id,
                    createdBy: actor.id,
                    status,
                    priority: data.priority ?? 'medium',
                    color: data.color ?? PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
                    startDate: data.startDate ?? null,
                    dueDate: data.dueDate ?? null,
                    completedAt: status === 'completed' ? at : null,
                    createdAt: at,
                    updatedAt: at,
                })
                .returning();

            await attachMember(project.id, project.ownerId, actor.id, 'manager');
            await attachMember(project.id, actor.id, actor.id, actor.id === project.ownerId ? 'manager' : 'member');

            if (project.ownerId !== actor.id) {
                await Notify.projectMemberAdded(project, project.ownerId, actor);
            }

            for (const userId of data.memberIds ?? []) {
                const [user] = await db().select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
                if (user) await ProjectService.addMember(project.id, user.id, actor, 'member', false);
            }

            await logActivity('project.created', `Created project "${project.name}"`, { type: 'project', id: project.id }, {}, actor.id);
            return (await ProjectHealthService.refresh(project.id))!;
        });
    },

    async update(projectId: number, data: Partial<ProjectData>, actor: Actor): Promise<ProjectRow> {
        return transaction(async () => {
            const project = await findProject(projectId);
            if (!project) throw new Error('Project not found');

            const columns: Record<string, keyof ProjectRow> = {
                name: 'name',
                description: 'description',
                owner_id: 'ownerId',
                status: 'status',
                priority: 'priority',
                color: 'color',
                start_date: 'startDate',
                due_date: 'dueDate',
            };
            const values: Partial<ProjectRow> = {};
            const changed: string[] = [];
            for (const [field, column] of Object.entries(columns)) {
                if (!(column in data)) continue;
                const next = (data as Record<string, unknown>)[column] ?? null;
                if (String(project[column] ?? '') !== String(next ?? '')) {
                    (values as Record<string, unknown>)[column] = next;
                    changed.push(field);
                }
            }
            if (!changed.length) return project;

            if (values.status !== undefined) {
                values.completedAt = values.status === 'completed' ? now() : null;
            }
            await db().update(projects).set({ ...values, updatedAt: now() }).where(eq(projects.id, project.id));
            const updated = (await findProject(project.id))!;

            if (updated.ownerId !== project.ownerId) {
                await attachMember(updated.id, updated.ownerId, actor.id, 'manager');
                await db()
                    .update(projectMembers)
                    .set({ role: 'manager', updatedAt: now() })
                    .where(and(eq(projectMembers.projectId, updated.id), eq(projectMembers.userId, updated.ownerId)));
                if (updated.ownerId !== actor.id) await Notify.projectMemberAdded(updated, updated.ownerId, actor);
            }

            if (updated.status !== project.status) {
                await logActivity(
                    'project.status_changed',
                    `Changed project "${updated.name}" status from ${ProjectStatus.label(project.status as ProjectStatusValue)} to ${ProjectStatus.label(updated.status as ProjectStatusValue)}`,
                    { type: 'project', id: updated.id },
                    { old_status: project.status, new_status: updated.status },
                    actor.id,
                );
            }
            await logActivity('project.updated', `Updated project "${updated.name}" (${changed.join(', ')})`, { type: 'project', id: updated.id }, { fields: changed }, actor.id);

            return (await ProjectHealthService.refresh(updated.id))!;
        });
    },

    async addMember(projectId: number, userId: number, actor: Actor, role: ProjectMemberRole = 'member', log = true): Promise<boolean> {
        if (!(await attachMember(projectId, userId, actor.id, role))) return false;
        const project = (await findProject(projectId))!;

        if (log) {
            await logActivity('project.member_added', `Added ${await userName(userId)} to project "${project.name}"`, { type: 'project', id: projectId }, { user_id: userId, role }, actor.id);
        }
        if (userId !== actor.id) await Notify.projectMemberAdded(project, userId, actor);
        return true;
    },

    /** The owner cannot be removed — transfer ownership first. */
    async removeMember(projectId: number, userId: number, actor: Actor): Promise<boolean> {
        const project = await findProject(projectId);
        if (!project || project.ownerId === userId) return false;

        const removed = await db()
            .delete(projectMembers)
            .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
            .returning({ id: projectMembers.id });
        if (removed.length) {
            await logActivity('project.member_removed', `Removed ${await userName(userId)} from project "${project.name}"`, { type: 'project', id: projectId }, { user_id: userId }, actor.id);
        }
        return removed.length > 0;
    },

    /** The owner is always a manager. */
    async changeMemberRole(projectId: number, userId: number, role: ProjectMemberRole, actor: Actor): Promise<boolean> {
        const project = await findProject(projectId);
        if (!project || project.ownerId === userId) return false;

        const updated = await db()
            .update(projectMembers)
            .set({ role, updatedAt: now() })
            .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
            .returning({ id: projectMembers.id });
        if (!updated.length) return false;

        await logActivity(
            'project.member_role_changed',
            `Changed ${await userName(userId)}'s role in "${project.name}" to ${role === 'manager' ? 'Manager' : 'Member'}`,
            { type: 'project', id: projectId },
            { user_id: userId, role },
            actor.id,
        );
        return true;
    },

    async delete(projectId: number, actor: Actor): Promise<void> {
        await transaction(async () => {
            const project = await findProject(projectId);
            if (!project) return;
            const at = now();
            await db()
                .update(tasks)
                .set({ deletedAt: at, updatedAt: at })
                .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
            await db().update(projects).set({ deletedAt: at, updatedAt: at }).where(eq(projects.id, projectId));
            await logActivity('project.deleted', `Deleted project "${project.name}"`, { type: 'project', id: projectId }, {}, actor.id);
        });
    },
};

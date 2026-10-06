import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { db, schema } from './db';
import { FULL_ACCESS_ROLES } from './enums';

/*
 * Authorization. Ported from ProjectPolicy, TaskPolicy and Gate::before (admins pass everything).
 *
 * Scopes (`projectVisibleTo`, `taskVisibleTo`) are SQL fragments for list queries. Policies are
 * synchronous checks over pre-loaded access data, so a page of 20 task rows costs two queries
 * instead of dozens — the same reason the Laravel views eager-loaded relations.
 */

const { projects, tasks, projectMembers, taskCollaborators } = schema;

/** `fullAccess`: administrators and executives see and manage every project and task. */
export type Actor = { id: number; fullAccess: boolean };

/* ------------------------------------------------------------------ Scopes */

/** Projects a user may see: admins see all; others see owned, created or member projects. */
export function projectVisibleTo(user: Actor): SQL | undefined {
    if (user.fullAccess) return undefined;
    return sql`(${projects.ownerId} = ${user.id} or ${projects.createdBy} = ${user.id} or exists (select 1 from project_members pm where pm.project_id = ${projects.id} and pm.user_id = ${user.id}))`;
}

/** Tasks in projects visible to the user, plus tasks they created, are assigned to or collaborate on. */
export function taskVisibleTo(user: Actor): SQL | undefined {
    if (user.fullAccess) return undefined;
    return sql`(exists (select 1 from projects p where p.id = ${tasks.projectId} and p.deleted_at is null and (p.owner_id = ${user.id} or p.created_by = ${user.id} or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = ${user.id})))
        or ${tasks.assigneeId} = ${user.id}
        or ${tasks.createdBy} = ${user.id}
        or exists (select 1 from task_collaborators tc where tc.task_id = ${tasks.id} and tc.user_id = ${user.id}))`;
}

/** Assigned to, collaborating on, or created by the user. */
export function taskInvolving(userId: number): SQL {
    return sql`(${tasks.assigneeId} = ${userId} or ${tasks.createdBy} = ${userId} or exists (select 1 from task_collaborators tc where tc.task_id = ${tasks.id} and tc.user_id = ${userId}))`;
}

export const projectAlive = isNull(projects.deletedAt);
export const taskAlive = isNull(tasks.deletedAt);

/* ------------------------------------------------------------------ Access data */

export type ProjectAccess = { id: number; ownerId: number; createdBy: number; roles: Map<number, string> };

export type TaskAccess = {
    id: number;
    assigneeId: number | null;
    createdBy: number;
    collaboratorIds: Set<number>;
    project: ProjectAccess | null;
};

export async function loadProjectAccess(ids: number[]): Promise<Map<number, ProjectAccess>> {
    const unique = [...new Set(ids)];
    const result = new Map<number, ProjectAccess>();
    if (!unique.length) return result;

    // Sequential on purpose: inside a transaction both would share one connection.
    const rows = await db()
        .select({ id: projects.id, ownerId: projects.ownerId, createdBy: projects.createdBy })
        .from(projects)
        .where(and(inArray(projects.id, unique), projectAlive));
    const members = await db()
        .select({ projectId: projectMembers.projectId, userId: projectMembers.userId, role: projectMembers.role })
        .from(projectMembers)
        .where(inArray(projectMembers.projectId, unique));
    for (const row of rows) result.set(row.id, { ...row, roles: new Map() });
    for (const m of members) result.get(m.projectId)?.roles.set(m.userId, m.role);
    return result;
}

type TaskAccessSource = { id: number; assigneeId: number | null; createdBy: number; projectId: number | null };

export async function loadTaskAccess(rows: TaskAccessSource[]): Promise<Map<number, TaskAccess>> {
    const result = new Map<number, TaskAccess>();
    if (!rows.length) return result;

    const projectAccess = await loadProjectAccess(rows.map((t) => t.projectId).filter((id): id is number => id !== null));
    const collaborators = await db()
        .select({ taskId: taskCollaborators.taskId, userId: taskCollaborators.userId })
        .from(taskCollaborators)
        .where(inArray(taskCollaborators.taskId, rows.map((t) => t.id)));
    for (const t of rows) {
        result.set(t.id, {
            id: t.id,
            assigneeId: t.assigneeId,
            createdBy: t.createdBy,
            collaboratorIds: new Set(),
            project: t.projectId ? (projectAccess.get(t.projectId) ?? null) : null,
        });
    }
    for (const c of collaborators) result.get(c.taskId)?.collaboratorIds.add(c.userId);
    return result;
}

/** Load one live task's access data, or null when it does not exist (or was deleted). */
export async function taskAccess(taskId: number): Promise<TaskAccess | null> {
    const rows = await db()
        .select({ id: tasks.id, assigneeId: tasks.assigneeId, createdBy: tasks.createdBy, projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), taskAlive))
        .limit(1);
    if (!rows[0]) return null;
    return (await loadTaskAccess(rows))!.get(taskId) ?? null;
}

export async function projectAccess(projectId: number): Promise<ProjectAccess | null> {
    return (await loadProjectAccess([projectId])).get(projectId) ?? null;
}

/* ------------------------------------------------------------------ Policies */

export const isProjectMember = (p: ProjectAccess, userId: number) => p.ownerId === userId || p.roles.has(userId);
export const isProjectManager = (p: ProjectAccess, userId: number) => p.ownerId === userId || p.roles.get(userId) === 'manager';

export const can = {
    /* Projects — any user can create; owner & managers edit and manage members; only the owner deletes. */
    viewProject: (u: Actor, p: ProjectAccess) => u.fullAccess || p.ownerId === u.id || p.createdBy === u.id || isProjectMember(p, u.id),
    updateProject: (u: Actor, p: ProjectAccess) => u.fullAccess || isProjectManager(p, u.id),
    manageMembers: (u: Actor, p: ProjectAccess) => u.fullAccess || isProjectManager(p, u.id),
    createTask: (u: Actor, p: ProjectAccess) => can.viewProject(u, p),
    deleteProject: (u: Actor, p: ProjectAccess) => u.fullAccess || p.ownerId === u.id,

    /* Tasks */
    viewTask: (u: Actor, t: TaskAccess) =>
        u.fullAccess || t.assigneeId === u.id || t.createdBy === u.id || t.collaboratorIds.has(u.id) || (t.project !== null && can.viewProject(u, t.project)),
    /** Quick update (status / progress / remark). */
    updateTask: (u: Actor, t: TaskAccess) =>
        u.fullAccess || t.assigneeId === u.id || t.createdBy === u.id || t.collaboratorIds.has(u.id) || (t.project !== null && isProjectManager(t.project, u.id)),
    /** Change details, assignee and dates. */
    editTask: (u: Actor, t: TaskAccess) => u.fullAccess || t.createdBy === u.id || t.assigneeId === u.id || (t.project !== null && isProjectManager(t.project, u.id)),
    manageCollaborators: (u: Actor, t: TaskAccess) => can.editTask(u, t),
    comment: (u: Actor, t: TaskAccess) => can.viewTask(u, t),
    deleteTask: (u: Actor, t: TaskAccess) => u.fullAccess || t.createdBy === u.id || (t.project !== null && isProjectManager(t.project, u.id)),
};

/** Users @-mentioned can only be notified when they could open the task. */
export async function usersWhoCanViewTask(userIds: number[], access: TaskAccess): Promise<number[]> {
    if (!userIds.length) return [];
    const admins = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
        .where(and(inArray(schema.users.id, userIds), inArray(schema.roles.name, [...FULL_ACCESS_ROLES])));
    const fullAccessIds = new Set(admins.map((a) => a.id));
    return userIds.filter((id) => can.viewTask({ id, fullAccess: fullAccessIds.has(id) }, access));
}

import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import { can, loadTaskAccess, type Actor } from './access';
import { formatDate, today } from './dates';
import type { Priority, TaskStatus } from './enums';
import { Settings } from './settings';
import { dueLabel, dueState, type DueState } from './task-utils';
import { usersByIds, type UserLite } from './users';
import type { TaskRow } from './services/tasks';

/*
 * View models: plain, serialisable data for list rows, built for a whole page at once so a list
 * of 20 tasks costs a handful of queries (the Blade views eager-loaded relations for the same
 * reason).
 */

export type ProjectChip = { id: number; name: string; color: string };

export type TaskRowData = {
    id: number;
    title: string;
    /** Post-launch type (enhancement / bug fix / update), or null for a regular task. */
    category: string | null;
    status: TaskStatus;
    priority: Priority;
    progress: number;
    latestRemark: string | null;
    /** Null for standalone tasks (and for tasks whose project is gone). */
    project: ProjectChip | null;
    /** Not part of any project. */
    standalone: boolean;
    assignee: UserLite | null;
    due: { text: string | null; state: DueState; title: string | null };
    canUpdate: boolean;
    /** Pinned by the viewer as a priority (Focus of the Day). */
    focused: boolean;
};

export type DueContext = { today: string; dueSoonDays: number };

export async function dueContext(): Promise<DueContext> {
    return { today: today(), dueSoonDays: await Settings.int('deadline.due_soon_days') };
}

export function describeDue(task: { dueDate: string | null; status: string }, ctx: DueContext, format = 'M j') {
    return {
        text: task.dueDate ? formatDate(task.dueDate, format) : null,
        state: dueState(task, ctx.today, ctx.dueSoonDays),
        title: task.dueDate ? `${dueLabel(task.dueDate, ctx.today)} · ${formatDate(task.dueDate, 'D, M j, Y')}` : null,
    };
}

export async function projectChips(ids: (number | null)[]): Promise<Map<number, ProjectChip>> {
    const unique = [...new Set(ids.filter((id): id is number => id !== null))];
    if (!unique.length) return new Map();
    const rows = await db()
        .select({ id: schema.projects.id, name: schema.projects.name, color: schema.projects.color })
        .from(schema.projects)
        .where(inArray(schema.projects.id, unique));
    return new Map(rows.map((p) => [p.id, p]));
}

export async function buildTaskRows(user: Actor, rows: TaskRow[], options: { dueFormat?: string } = {}): Promise<TaskRowData[]> {
    if (!rows.length) return [];

    const focusedIds = new Set(
        (
            await db()
                .select({ taskId: schema.taskFocus.taskId })
                .from(schema.taskFocus)
                .where(and(eq(schema.taskFocus.userId, user.id), inArray(schema.taskFocus.taskId, rows.map((t) => t.id))))
        ).map((f) => f.taskId),
    );
    const [ctx, projects, assignees, access] = [
        await dueContext(),
        await projectChips(rows.map((t) => t.projectId)),
        await usersByIds(rows.map((t) => t.assigneeId).filter((id): id is number => id !== null)),
        await loadTaskAccess(rows),
    ];

    return rows.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        status: t.status as TaskStatus,
        priority: t.priority as Priority,
        progress: t.progress,
        latestRemark: t.latestRemark,
        project: t.projectId ? (projects.get(t.projectId) ?? null) : null,
        standalone: t.projectId === null,
        assignee: t.assigneeId ? (assignees.get(t.assigneeId) ?? null) : null,
        due: describeDue(t, ctx, options.dueFormat),
        canUpdate: access.has(t.id) ? can.updateTask(user, access.get(t.id)!) : false,
        focused: focusedIds.has(t.id),
    }));
}

/** A task's append-only history, newest first, with the people who made each change. */
export async function loadHistory(taskId: number, limit: number, offset = 0) {
    const rows = await db()
        .select()
        .from(schema.taskUpdates)
        .where(eq(schema.taskUpdates.taskId, taskId))
        .orderBy(desc(schema.taskUpdates.createdAt), desc(schema.taskUpdates.id))
        .limit(limit)
        .offset(offset);
    const people = await usersByIds(rows.map((r) => r.userId).filter((id): id is number => id !== null));
    return rows.map((r) => ({ ...r, user: r.userId ? (people.get(r.userId) ?? null) : null }));
}

/** Page/offset helper for paginated lists. */
export function paging(searchParams: Record<string, string | string[] | undefined>, perPage: number) {
    const raw = Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page);
    const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
    return { page, perPage, offset: (page - 1) * perPage };
}

export function lastPage(total: number, perPage: number): number {
    return Math.max(1, Math.ceil(total / perPage));
}

export const param = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

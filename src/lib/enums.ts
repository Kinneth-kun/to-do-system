/*
 * Domain enums. Ported one-for-one from the Laravel app's app/Enums/*: the stored values,
 * labels and Tailwind colour families are unchanged.
 */

type Option = { value: string; label: string };

function defineEnum<V extends string, M extends Record<string, unknown>>(entries: Record<V, M & { label: string }>) {
    const values = Object.keys(entries) as V[];
    return {
        values,
        meta: entries,
        is: (value: unknown): value is V => typeof value === 'string' && value in entries,
        label: (value: V | null | undefined) => (value && entries[value] ? entries[value].label : 'Unknown'),
        options: (): Option[] => values.map((value) => ({ value, label: entries[value].label })),
    };
}

/* ------------------------------------------------------------------ Task status */

export const TaskStatus = defineEnum({
    pending: { label: 'Pending', color: 'slate' },
    in_progress: { label: 'In Progress', color: 'blue' },
    completed: { label: 'Completed', color: 'emerald' },
    delayed: { label: 'Delayed', color: 'red' },
    on_hold: { label: 'On Hold', color: 'amber' },
    cancelled: { label: 'Cancelled', color: 'zinc' },
});
export type TaskStatus = (typeof TaskStatus.values)[number];

export const taskStatusColor = (s: TaskStatus | null | undefined) => (s ? TaskStatus.meta[s].color : 'slate');

/** Statuses that count as "open work" (can still become delayed / due soon). */
export const OPEN_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'delayed'];
export const isOpenStatus = (s: TaskStatus) => OPEN_STATUSES.includes(s);

/** Statuses eligible for the automatic delay check. */
export const canAutoDelay = (s: TaskStatus) => s === 'pending' || s === 'in_progress';

/** Progress-driven status per spec: 0% Pending, 1–99% In Progress, 100% Completed. */
export function statusFromProgress(progress: number): TaskStatus {
    if (progress <= 0) return 'pending';
    if (progress >= 100) return 'completed';
    return 'in_progress';
}

/* ------------------------------------------------------------------ Priority */

export const Priority = defineEnum({
    low: { label: 'Low', color: 'slate', weight: 1 },
    medium: { label: 'Medium', color: 'sky', weight: 2 },
    high: { label: 'High', color: 'orange', weight: 3 },
    urgent: { label: 'Urgent', color: 'rose', weight: 4 },
});
export type Priority = (typeof Priority.values)[number];

/* ------------------------------------------------------------------ Project status */

export const ProjectStatus = defineEnum({
    active: { label: 'Active', color: 'blue' },
    on_hold: { label: 'On Hold', color: 'amber' },
    completed: { label: 'Completed', color: 'emerald' },
    cancelled: { label: 'Cancelled', color: 'zinc' },
});
export type ProjectStatus = (typeof ProjectStatus.values)[number];

/* ------------------------------------------------------------------ Task category (post-launch work) */

/**
 * Work logged on a project after it is completed — software is never really "done". A task with
 * a category is a post-launch item; a task without one is part of the original build.
 */
export const TaskCategory = defineEnum({
    enhancement: { label: 'Enhancement', color: 'violet', icon: 'sparkles' },
    bug_fix: { label: 'Bug fix', color: 'rose', icon: 'alert' },
    update: { label: 'Update', color: 'sky', icon: 'refresh' },
});
export type TaskCategory = (typeof TaskCategory.values)[number];

/* ------------------------------------------------------------------ Project health */

export const ProjectHealth = defineEnum({
    on_track: { label: 'On Track', color: 'emerald', urgency: 2 },
    at_risk: { label: 'At Risk', color: 'amber', urgency: 1 },
    delayed: { label: 'Delayed', color: 'red', urgency: 0 },
    completed: { label: 'Completed', color: 'indigo', urgency: 4 },
    on_hold: { label: 'On Hold', color: 'slate', urgency: 3 },
});
export type ProjectHealth = (typeof ProjectHealth.values)[number];

/* ------------------------------------------------------------------ Project member role */

export const ProjectMemberRole = defineEnum({
    manager: { label: 'Manager' },
    member: { label: 'Member' },
});
export type ProjectMemberRole = (typeof ProjectMemberRole.values)[number];

/* ------------------------------------------------------------------ Task update (history) type */

export const TaskUpdateType = defineEnum({
    created: { label: 'Created', system: false },
    update: { label: 'Progress update', system: false },
    remark: { label: 'Remark', system: false },
    assignment: { label: 'Reassigned', system: false },
    details: { label: 'Details changed', system: false },
    auto_delayed: { label: 'Automatically marked delayed', system: true },
    undelayed: { label: 'Delay cleared', system: true },
    // Subtasks were removed; kept so older history entries still read correctly.
    rollup: { label: 'Updated from subtasks', system: true },
});
export type TaskUpdateType = (typeof TaskUpdateType.values)[number];

/* ------------------------------------------------------------------ Notification type */

export const NotificationType = defineEnum({
    task_assigned: { label: 'Assigned to you', icon: 'user-plus', color: 'indigo' },
    collaborator_added: { label: 'Added as collaborator', icon: 'users', color: 'violet' },
    project_member_added: { label: 'Added to project', icon: 'folder', color: 'indigo' },
    deadline_approaching: { label: 'Deadline approaching', icon: 'clock', color: 'amber' },
    task_delayed: { label: 'Task delayed', icon: 'alert', color: 'red' },
    task_completed: { label: 'Task completed', icon: 'check-circle', color: 'emerald' },
    mentioned: { label: 'Mentioned you', icon: 'at', color: 'sky' },
    comment_added: { label: 'New comment', icon: 'chat', color: 'sky' },
    task_updated: { label: 'Task updated', icon: 'pencil', color: 'indigo' },
    project_completed: { label: 'Project completed', icon: 'check-circle', color: 'emerald' },
    suggestion_added: { label: 'New suggestion', icon: 'chat', color: 'amber' },
    attachment_added: { label: 'File attached', icon: 'paperclip', color: 'slate' },
    daily_digest: { label: 'Daily briefing', icon: 'sparkles', color: 'violet' },
});
export type NotificationType = (typeof NotificationType.values)[number];

/* ------------------------------------------------------------------ Department */

/**
 * Organizational departments. A user belongs to one, which is how their work is identified on
 * tasks (the department filter on My Tasks and the breakdown on the executive dashboard).
 */
export const Department = defineEnum({
    executive: { label: 'Executive', code: 'EXEC', color: 'violet', icon: 'presentation' },
    human_resources: { label: 'Human Resources', code: 'HR', color: 'rose', icon: 'users' },
    leasing: { label: 'Leasing', code: 'LSG', color: 'amber', icon: 'folder' },
    marketing: { label: 'Marketing', code: 'MKT', color: 'fuchsia', icon: 'sparkles' },
    security: { label: 'Security', code: 'SEC', color: 'slate', icon: 'lock' },
    operations: { label: 'Operations', code: 'OPS', color: 'indigo', icon: 'cog' },
    information_technology: { label: 'Information Technology', code: 'IT', color: 'sky', icon: 'grid' },
    accounting: { label: 'Accounting', code: 'ACC', color: 'emerald', icon: 'chart' },
});
export type Department = (typeof Department.values)[number];

/**
 * Best-effort mapping of free-text department names onto the official list
 * (used when importing users and for ADMIN_DEPARTMENT).
 */
export function departmentFromLabel(value: string | null | undefined): Department | null {
    if (!value || !value.trim()) return null;
    const normalized = value.trim().toLowerCase();
    const exact = normalized.replace(/[ -]/g, '_');
    if (Department.is(exact)) return exact;

    const has = (...needles: string[]) => needles.some((n) => normalized.includes(n));
    if (has('exec', 'ceo', 'president', 'board')) return 'executive';
    if (has('human') || ['hr', 'people', 'personnel'].includes(normalized)) return 'human_resources';
    if (has('leas', 'tenant', 'property')) return 'leasing';
    if (has('market', 'brand', 'design', 'creative')) return 'marketing';
    if (has('secur', 'safety', 'guard')) return 'security';
    if (has('account', 'financ', 'payroll', 'audit')) return 'accounting';
    if (has('it', 'tech', 'engineer', 'software', 'develop', 'data')) return 'information_technology';
    if (has('oper', 'admin', 'management', 'facilit')) return 'operations';
    return null;
}

/* ------------------------------------------------------------------ Colours */

export const PROJECT_COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'teal', 'fuchsia', 'orange', 'cyan'] as const;
export const AVATAR_COLORS = PROJECT_COLORS;

export const ROLE_ADMIN = 'admin';
/** Same oversight as an administrator (all projects, tasks, dashboards, activity logs), but no
 *  user management and no settings. */
export const ROLE_EXECUTIVE = 'executive';
export const ROLE_USER = 'user';
export type RoleName = typeof ROLE_ADMIN | typeof ROLE_EXECUTIVE | typeof ROLE_USER;
/** Roles that see every project and task. */
export const FULL_ACCESS_ROLES: readonly RoleName[] = [ROLE_ADMIN, ROLE_EXECUTIVE];

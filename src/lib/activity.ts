import { db, schema } from './db';
import { now } from './dates';
import { requestMeta } from './request-context';

/*
 * Records key events for the admin Activity Log.
 *
 * Action naming convention: "<category>.<verb>", e.g.
 *   auth.login, auth.logout, auth.failed, auth.locked
 *   project.created|updated|deleted|status_changed|member_added|member_removed|member_role_changed
 *   task.created|updated|status_changed|progress_updated|remark_added|completed|delayed|assigned|deleted
 *   collaborator.added|removed, comment.added|deleted, attachment.uploaded|deleted
 *   user.created|updated|activated|deactivated|unlocked|password_reset|role_changed
 *   settings.updated, profile.password_changed
 *
 * `actorId` is the person who did it; null means the system (or nobody signed in yet).
 */
export type Subject = { type: 'user' | 'project' | 'task' | 'task_comment' | 'task_update' | 'attachment'; id: number } | null;

export async function logActivity(
    action: string,
    description: string,
    subject: Subject = null,
    properties: Record<string, unknown> = {},
    actorId: number | null = null,
): Promise<void> {
    const meta = await requestMeta();
    const text = description.length > 250 ? `${description.slice(0, 249)}…` : description;

    await db()
        .insert(schema.activityLogs)
        .values({
            userId: actorId,
            action,
            description: text,
            subjectType: subject?.type ?? null,
            subjectId: subject?.id ?? null,
            properties: Object.keys(properties).length ? properties : null,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
            createdAt: now(),
        });
}

/* ------------------------------------------------------------------ Presentation */

export type ActivityMeta = { label: string; icon: string; color: string };

/** Plain-language label, icon and colour for each action code, for the Activity Logs page. */
const ACTIVITY_META: Record<string, ActivityMeta> = {
    'auth.login': { label: 'Signed in', icon: 'key', color: 'emerald' },
    'auth.logout': { label: 'Signed out', icon: 'logout', color: 'slate' },
    'auth.failed': { label: 'Failed sign-in', icon: 'alert', color: 'amber' },
    'auth.locked': { label: 'Account locked', icon: 'lock', color: 'red' },

    'project.created': { label: 'Project created', icon: 'folder', color: 'indigo' },
    'project.updated': { label: 'Project edited', icon: 'pencil', color: 'indigo' },
    'project.status_changed': { label: 'Project status changed', icon: 'flag', color: 'indigo' },
    'project.deleted': { label: 'Project deleted', icon: 'trash', color: 'red' },
    'project.member_added': { label: 'Added to a project team', icon: 'user-plus', color: 'indigo' },
    'project.member_removed': { label: 'Removed from a project team', icon: 'users', color: 'slate' },
    'project.member_role_changed': { label: 'Team role changed', icon: 'users', color: 'indigo' },

    'task.created': { label: 'Task created', icon: 'plus', color: 'blue' },
    'task.updated': { label: 'Task edited', icon: 'pencil', color: 'blue' },
    'task.status_changed': { label: 'Status changed', icon: 'flag', color: 'blue' },
    'task.progress_updated': { label: 'Progress updated', icon: 'trending-up', color: 'blue' },
    'task.remark_added': { label: 'Remark added', icon: 'chat', color: 'blue' },
    'task.completed': { label: 'Task completed', icon: 'check-circle', color: 'emerald' },
    'task.delayed': { label: 'Task delayed', icon: 'alert', color: 'red' },
    'task.assigned': { label: 'Task assigned', icon: 'user-plus', color: 'blue' },
    'task.deleted': { label: 'Task deleted', icon: 'trash', color: 'red' },
    'collaborator.added': { label: 'Collaborator added', icon: 'user-plus', color: 'violet' },
    'collaborator.removed': { label: 'Collaborator removed', icon: 'users', color: 'slate' },
    'comment.added': { label: 'Comment added', icon: 'chat', color: 'sky' },
    'comment.deleted': { label: 'Comment deleted', icon: 'trash', color: 'slate' },
    'attachment.uploaded': { label: 'File uploaded', icon: 'paperclip', color: 'teal' },
    'attachment.deleted': { label: 'File deleted', icon: 'trash', color: 'slate' },

    'user.created': { label: 'Account created', icon: 'user-plus', color: 'amber' },
    'user.updated': { label: 'Account updated', icon: 'user', color: 'amber' },
    'user.activated': { label: 'Account activated', icon: 'unlock', color: 'emerald' },
    'user.deactivated': { label: 'Account deactivated', icon: 'ban', color: 'red' },
    'user.unlocked': { label: 'Account unlocked', icon: 'unlock', color: 'amber' },
    'user.password_reset': { label: 'Password reset', icon: 'key', color: 'amber' },
    'user.role_changed': { label: 'Role changed', icon: 'users', color: 'amber' },
    'profile.password_changed': { label: 'Password changed', icon: 'key', color: 'amber' },
    'settings.updated': { label: 'Settings changed', icon: 'cog', color: 'rose' },
};

export function activityMeta(action: string): ActivityMeta {
    const known = ACTIVITY_META[action];
    if (known) return known;
    // Unknown codes still read as words: "task.something_new" → "Something new".
    const verb = (action.split('.')[1] ?? action).replace(/_/g, ' ');
    return { label: verb.charAt(0).toUpperCase() + verb.slice(1), icon: 'info', color: 'slate' };
}

/** The "Type" filter on the Activity Logs page, as groups of action prefixes. */
export const ACTIVITY_GROUPS = {
    tasks: { label: 'Tasks', prefixes: ['task.', 'collaborator.'] },
    comments: { label: 'Comments & files', prefixes: ['comment.', 'attachment.'] },
    projects: { label: 'Projects', prefixes: ['project.'] },
    signins: { label: 'Sign-ins', prefixes: ['auth.'] },
    accounts: { label: 'Accounts & passwords', prefixes: ['user.', 'profile.'] },
    settings: { label: 'Settings', prefixes: ['settings.'] },
} as const;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

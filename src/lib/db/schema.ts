import {
    bigint,
    boolean,
    date,
    index,
    integer,
    jsonb,
    pgTable,
    serial,
    smallint,
    text,
    timestamp,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/pg-core';

/*
 * Schema ported from the Laravel migrations (database/migrations/*). Column names are unchanged;
 * the cache/session/job tables Laravel needed are replaced by `sessions`, `locks` and `rate_limits`,
 * which keep that state in Postgres because Vercel functions share no memory between requests.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const timestamps = {
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
};

export const roles = pgTable('roles', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(), // admin | user
    label: varchar('label', { length: 100 }).notNull(),
    description: varchar('description', { length: 255 }),
    ...timestamps,
});

export const users = pgTable(
    'users',
    {
        id: serial('id').primaryKey(),
        roleId: integer('role_id').notNull().references(() => roles.id),
        name: varchar('name', { length: 255 }).notNull(),
        username: varchar('username', { length: 50 }).notNull().unique(), // used for @mentions
        email: varchar('email', { length: 255 }).notNull().unique(),
        jobTitle: varchar('job_title', { length: 255 }),
        department: varchar('department', { length: 40 }), // Department enum value
        avatarColor: varchar('avatar_color', { length: 20 }).notNull().default('indigo'),
        isActive: boolean('is_active').notNull().default(true),
        emailVerifiedAt: ts('email_verified_at'),
        password: varchar('password', { length: 255 }).notNull(),
        failedLoginAttempts: smallint('failed_login_attempts').notNull().default(0),
        lockedUntil: ts('locked_until'),
        lastLoginAt: ts('last_login_at'),
        lastLoginIp: varchar('last_login_ip', { length: 45 }),
        ...timestamps,
    },
    (t) => [index('users_department_index').on(t.department)],
);

/** Signed-in sessions. The cookie holds a random token; only its SHA-256 hash is stored here. */
export const sessions = pgTable(
    'sessions',
    {
        id: varchar('id', { length: 64 }).primaryKey(),
        userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
        remember: boolean('remember').notNull().default(false),
        ipAddress: varchar('ip_address', { length: 45 }),
        userAgent: text('user_agent'),
        lastActivity: ts('last_activity').notNull().defaultNow(),
        expiresAt: ts('expires_at').notNull(),
        createdAt: ts('created_at').notNull().defaultNow(),
    },
    (t) => [index('sessions_user_id_index').on(t.userId)],
);

export const projects = pgTable(
    'projects',
    {
        id: serial('id').primaryKey(),
        name: varchar('name', { length: 255 }).notNull(),
        description: text('description'),
        ownerId: integer('owner_id').notNull().references(() => users.id),
        createdBy: integer('created_by').notNull().references(() => users.id),
        status: varchar('status', { length: 20 }).notNull().default('active'),
        priority: varchar('priority', { length: 20 }).notNull().default('medium'),
        color: varchar('color', { length: 20 }).notNull().default('indigo'),
        startDate: date('start_date', { mode: 'string' }),
        dueDate: date('due_date', { mode: 'string' }),
        completedAt: ts('completed_at'),
        // Cached, recalculated by the health service whenever tasks change.
        progress: smallint('progress').notNull().default(0),
        health: varchar('health', { length: 20 }).notNull().default('on_track'),
        ...timestamps,
        deletedAt: ts('deleted_at'),
    },
    (t) => [index('projects_status_index').on(t.status), index('projects_due_date_index').on(t.dueDate), index('projects_health_index').on(t.health)],
);

export const projectMembers = pgTable(
    'project_members',
    {
        id: serial('id').primaryKey(),
        projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
        userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
        role: varchar('role', { length: 20 }).notNull().default('member'),
        addedBy: integer('added_by').references(() => users.id, { onDelete: 'set null' }),
        ...timestamps,
    },
    (t) => [uniqueIndex('project_members_project_user_unique').on(t.projectId, t.userId), index('project_members_user_index').on(t.userId)],
);

/** Recommendations and suggestions people leave on a project (shown on its card, newest first). */
export const projectSuggestions = pgTable(
    'project_suggestions',
    {
        id: serial('id').primaryKey(),
        projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
        userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
        body: text('body').notNull(),
        ...timestamps,
    },
    (t) => [index('project_suggestions_project_created_index').on(t.projectId, t.createdAt)],
);

export const tasks = pgTable(
    'tasks',
    {
        id: serial('id').primaryKey(),
        // Null = a standalone task: short-term work (a day, a week) that doesn't need a project.
        projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
        title: varchar('title', { length: 255 }).notNull(),
        description: text('description'),
        // Null = a regular (build) task. Otherwise a post-launch item on a completed project:
        // enhancement | bug_fix | update (TaskCategory). These don't affect project progress.
        category: varchar('category', { length: 20 }),
        status: varchar('status', { length: 20 }).notNull().default('pending'),
        statusBeforeDelay: varchar('status_before_delay', { length: 20 }),
        priority: varchar('priority', { length: 20 }).notNull().default('medium'),
        progress: smallint('progress').notNull().default(0),
        // Business rule: a single primary assignee.
        assigneeId: integer('assignee_id').references(() => users.id, { onDelete: 'set null' }),
        createdBy: integer('created_by').notNull().references(() => users.id),
        startDate: date('start_date', { mode: 'string' }),
        dueDate: date('due_date', { mode: 'string' }),
        completedAt: ts('completed_at'),
        delayedAt: ts('delayed_at'),
        // Denormalised "latest update" for fast list rendering.
        latestRemark: text('latest_remark'),
        latestUpdateAt: ts('latest_update_at'),
        latestUpdateBy: integer('latest_update_by').references(() => users.id, { onDelete: 'set null' }),
        position: integer('position').notNull().default(0),
        ...timestamps,
        deletedAt: ts('deleted_at'),
    },
    (t) => [
        index('tasks_status_index').on(t.status),
        index('tasks_priority_index').on(t.priority),
        index('tasks_due_date_index').on(t.dueDate),
        index('tasks_project_index').on(t.projectId),
        index('tasks_project_category_index').on(t.projectId, t.category),
        index('tasks_assignee_status_index').on(t.assigneeId, t.status),
        index('tasks_created_by_index').on(t.createdBy),
    ],
);

export const taskCollaborators = pgTable(
    'task_collaborators',
    {
        id: serial('id').primaryKey(),
        taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
        userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
        addedBy: integer('added_by').references(() => users.id, { onDelete: 'set null' }),
        ...timestamps,
    },
    (t) => [uniqueIndex('task_collaborators_task_user_unique').on(t.taskId, t.userId), index('task_collaborators_user_index').on(t.userId)],
);

/** Tasks a person pinned as a priority — shown in their own Focus of the Day. */
export const taskFocus = pgTable(
    'task_focus',
    {
        id: serial('id').primaryKey(),
        userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
        taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
        createdAt: ts('created_at').notNull().defaultNow(),
    },
    (t) => [uniqueIndex('task_focus_user_task_unique').on(t.userId, t.taskId)],
);

/** Append-only history. Rows are never updated or deleted by the application (enforced by a trigger). */
export const taskUpdates = pgTable(
    'task_updates',
    {
        id: serial('id').primaryKey(),
        taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
        userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }), // null = system
        type: varchar('type', { length: 30 }).notNull(),
        oldStatus: varchar('old_status', { length: 20 }),
        newStatus: varchar('new_status', { length: 20 }),
        oldProgress: smallint('old_progress'),
        newProgress: smallint('new_progress'),
        remark: text('remark'),
        meta: jsonb('meta').$type<Record<string, unknown>>(),
        ...timestamps,
    },
    (t) => [index('task_updates_type_index').on(t.type), index('task_updates_task_created_index').on(t.taskId, t.createdAt)],
);

export const taskComments = pgTable(
    'task_comments',
    {
        id: serial('id').primaryKey(),
        taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
        userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
        body: text('body').notNull(),
        ...timestamps,
    },
    (t) => [index('task_comments_task_index').on(t.taskId)],
);

export const attachments = pgTable(
    'attachments',
    {
        id: serial('id').primaryKey(),
        attachableType: varchar('attachable_type', { length: 40 }).notNull(), // 'task' (or 'task_comment')
        attachableId: integer('attachable_id').notNull(),
        userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
        originalName: varchar('original_name', { length: 255 }).notNull(),
        path: varchar('path', { length: 500 }).notNull(),
        disk: varchar('disk', { length: 30 }).notNull().default('local'), // 'local' | 'blob'
        mimeType: varchar('mime_type', { length: 150 }),
        size: bigint('size', { mode: 'number' }).notNull().default(0),
        ...timestamps,
    },
    (t) => [index('attachments_attachable_index').on(t.attachableType, t.attachableId)],
);

/** In-app notification center. */
export const notifications = pgTable(
    'notifications',
    {
        id: serial('id').primaryKey(),
        userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // recipient
        actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
        type: varchar('type', { length: 40 }).notNull(),
        title: varchar('title', { length: 255 }).notNull(),
        message: text('message'),
        url: varchar('url', { length: 500 }),
        subjectType: varchar('subject_type', { length: 40 }),
        subjectId: integer('subject_id'),
        data: jsonb('data').$type<Record<string, unknown>>(),
        readAt: ts('read_at'),
        ...timestamps,
    },
    (t) => [
        index('notifications_type_index').on(t.type),
        index('notifications_user_read_index').on(t.userId, t.readAt),
        index('notifications_subject_index').on(t.subjectType, t.subjectId),
    ],
);

export const activityLogs = pgTable(
    'activity_logs',
    {
        id: serial('id').primaryKey(),
        userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
        action: varchar('action', { length: 60 }).notNull(), // e.g. auth.login, task.created
        description: varchar('description', { length: 255 }).notNull(),
        subjectType: varchar('subject_type', { length: 40 }),
        subjectId: integer('subject_id'),
        properties: jsonb('properties').$type<Record<string, unknown>>(),
        ipAddress: varchar('ip_address', { length: 45 }),
        userAgent: text('user_agent'),
        createdAt: ts('created_at').notNull().defaultNow(),
    },
    (t) => [index('activity_logs_action_index').on(t.action), index('activity_logs_created_index').on(t.createdAt), index('activity_logs_user_index').on(t.userId)],
);

export const settings = pgTable('settings', {
    id: serial('id').primaryKey(),
    key: varchar('key', { length: 100 }).notNull().unique(),
    value: text('value'),
    ...timestamps,
});

/** Short-lived named locks (e.g. "run the deadline check at most every 5 minutes"). */
export const locks = pgTable('locks', {
    key: varchar('key', { length: 100 }).primaryKey(),
    expiresAt: ts('expires_at').notNull(),
});

/** Fixed-window request counters for throttling (login per IP, lookups per user). */
export const rateLimits = pgTable('rate_limits', {
    key: varchar('key', { length: 150 }).primaryKey(),
    hits: integer('hits').notNull().default(0),
    resetAt: ts('reset_at').notNull(),
});

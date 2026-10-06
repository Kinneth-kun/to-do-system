/*
 * Route helpers — the named routes of the Laravel app, as paths. Notification links are stored
 * as site-relative paths so they keep working on any domain (preview URLs, custom domains).
 */

type Query = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, query: Query = {}): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined || value === '' || value === false) continue;
        params.set(key, value === true ? '1' : String(value));
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

export const routes = {
    login: () => '/login',
    dashboard: () => '/',
    profile: () => '/profile',
    projects: (query?: Query) => withQuery('/projects', query),
    projectCreate: () => '/projects/new',
    project: (id: number) => `/projects/${id}`,
    projectEdit: (id: number) => `/projects/${id}/edit`,
    tasks: (query?: Query) => withQuery('/tasks', query),
    taskCreate: (query?: Query) => withQuery('/tasks/new', query),
    task: (id: number) => `/tasks/${id}`,
    taskEdit: (id: number) => `/tasks/${id}/edit`,
    taskUpdates: (id: number) => `/tasks/${id}/updates`,
    attachment: (id: number) => `/attachments/${id}`,
    calendar: (query?: Query) => withQuery('/calendar', query),
    notifications: () => '/notifications',
    notificationOpen: (id: number) => `/notifications/${id}/open`,
    search: (query?: Query) => withQuery('/search', query),
    adminExecutive: () => '/admin/executive',
    adminMeeting: () => '/admin/meeting',
    adminUsers: (query?: Query) => withQuery('/admin/users', query),
    adminUserCreate: () => '/admin/users/new',
    adminUserEdit: (id: number) => `/admin/users/${id}/edit`,
    adminActivityLogs: (query?: Query) => withQuery('/admin/activity-logs', query),
    adminSettings: () => '/admin/settings',
};

/**
 * Only same-site relative paths, so a stored or submitted URL can never be used as an open
 * redirect ("/tasks/1" yes; "//evil.example" and "https://evil.example" no).
 */
export function safeRelativePath(value: string | null | undefined): string | null {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
    return value;
}

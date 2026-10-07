import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { ACTIVITY_GROUPS, activityMeta, type ActivityGroup } from '@/lib/activity';
import { requireFullAccess } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { addDays, diffForHumans, formatDate, toDateString, today } from '@/lib/dates';
import { withQuery } from '@/lib/urls';
import { usersByIds } from '@/lib/users';
import { lastPage, paging, param } from '@/lib/views';
import { AutoSubmitSelect } from '@/components/client/auto-submit';
import { Icon } from '@/components/icon';
import { Avatar, EmptyState, PageHeader, Pagination } from '@/components/ui';

export const metadata: Metadata = { title: 'Activity Logs' };

const PER_PAGE = 30;
const { activityLogs } = schema;

const isGroup = (value: string | undefined): value is ActivityGroup => !!value && value in ACTIVITY_GROUPS;

/** "Today", "Yesterday", or "Monday, October 5, 2026". */
function dayHeading(day: string, current: string): string {
    if (day === current) return 'Today';
    if (day === addDays(current, -1)) return 'Yesterday';
    return formatDate(day, 'l, F j, Y');
}

/** ?type=tasks|comments|projects|signins|accounts|settings&user_id= */
export default async function ActivityLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    await requireFullAccess();
    const params = await searchParams;
    const type = isGroup(param(params.type)) ? (param(params.type) as ActivityGroup) : null;
    const userId = /^\d+$/.test(param(params.user_id) ?? '') ? Number(param(params.user_id)) : null;

    const where = and(
        type ? or(...ACTIVITY_GROUPS[type].prefixes.map((prefix) => sql`${activityLogs.action} like ${`${prefix}%`}`)) : undefined,
        userId ? eq(activityLogs.userId, userId) : undefined,
    );
    const { page, offset } = paging(params, PER_PAGE);
    const [{ total }] = await db().select({ total: count() }).from(activityLogs).where(where);
    const logs = await db().select().from(activityLogs).where(where).orderBy(desc(activityLogs.createdAt), desc(activityLogs.id)).limit(PER_PAGE).offset(offset);
    const actors = await usersByIds(logs.map((l) => l.userId).filter((id): id is number => id !== null));
    const users = await db().select({ id: schema.users.id, name: schema.users.name }).from(schema.users).orderBy(asc(schema.users.name));

    // "View task" / "View project" links, only for things that still exist.
    const idsOf = (subject: string) => [...new Set(logs.filter((l) => l.subjectType === subject && l.subjectId !== null).map((l) => l.subjectId!))];
    const taskIds = idsOf('task');
    const projectIds = idsOf('project');
    const liveTasks = new Set(
        taskIds.length ? (await db().select({ id: schema.tasks.id }).from(schema.tasks).where(and(inArray(schema.tasks.id, taskIds), isNull(schema.tasks.deletedAt)))).map((r) => r.id) : [],
    );
    const liveProjects = new Set(
        projectIds.length
            ? (await db().select({ id: schema.projects.id }).from(schema.projects).where(and(inArray(schema.projects.id, projectIds), isNull(schema.projects.deletedAt)))).map((r) => r.id)
            : [],
    );
    const linkFor = (log: (typeof logs)[number]) => {
        if (log.subjectType === 'task' && log.subjectId && liveTasks.has(log.subjectId)) return { href: `/tasks/${log.subjectId}`, label: 'View task' };
        if (log.subjectType === 'project' && log.subjectId && liveProjects.has(log.subjectId)) return { href: `/projects/${log.subjectId}`, label: 'View project' };
        return null;
    };

    // Group the page by day (in the app's timezone).
    const current = today();
    const days: { day: string; entries: typeof logs }[] = [];
    for (const log of logs) {
        const day = toDateString(log.createdAt);
        if (days.at(-1)?.day !== day) days.push({ day, entries: [] });
        days.at(-1)!.entries.push(log);
    }

    const filters = { type, user_id: userId };

    return (
        <>
            <PageHeader title="Activity Logs" description="Who did what, and when — across every project and task." />

            <form method="GET" className="toolbar mb-6">
                <AutoSubmitSelect className="form-select sm:w-56" name="type" defaultValue={type ?? ''} aria-label="Type of activity">
                    <option value="">All activity</option>
                    {Object.entries(ACTIVITY_GROUPS).map(([value, group]) => (
                        <option key={value} value={value}>
                            {group.label}
                        </option>
                    ))}
                </AutoSubmitSelect>
                <AutoSubmitSelect className="form-select sm:w-56" name="user_id" defaultValue={userId ?? ''} aria-label="Person">
                    <option value="">Everyone</option>
                    {users.map((u) => (
                        <option key={u.id} value={u.id}>
                            {u.name}
                        </option>
                    ))}
                </AutoSubmitSelect>
                <noscript>
                    <button className="btn-secondary" type="submit">
                        Apply
                    </button>
                </noscript>
            </form>

            {days.length ? (
                <div className="space-y-6">
                    {days.map(({ day, entries }) => (
                        <section key={day}>
                            <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{dayHeading(day, current)}</h2>
                            <div className="card divide-y divide-slate-100">
                                {entries.map((log) => {
                                    const actor = log.userId ? actors.get(log.userId) : null;
                                    const meta = activityMeta(log.action);
                                    const link = linkFor(log);
                                    return (
                                        <div key={log.id} className="flex items-start gap-3 px-5 py-3.5">
                                            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-${meta.color}-50 text-${meta.color}-600`} title={meta.label}>
                                                <Icon name={meta.icon} className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-slate-800">{log.description}</p>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                                    <span className={`font-medium text-${meta.color}-700`}>{meta.label}</span>
                                                    <span aria-hidden="true">·</span>
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {actor ? <Avatar user={actor} size="xs" /> : <Icon name="refresh" className="h-3.5 w-3.5 text-slate-400" />}
                                                        {actor?.name ?? 'TaskFlow (automatic)'}
                                                    </span>
                                                    <span aria-hidden="true">·</span>
                                                    <time dateTime={log.createdAt.toISOString()} title={diffForHumans(log.createdAt)}>
                                                        {formatDate(log.createdAt, 'g:i A')}
                                                    </time>
                                                    <span className="text-slate-400">({diffForHumans(log.createdAt)})</span>
                                                </div>
                                            </div>
                                            {link && (
                                                <Link href={link.href} className="btn-ghost btn-sm shrink-0">
                                                    {link.label}
                                                    <Icon name="arrow-right" className="h-3.5 w-3.5" />
                                                </Link>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <div className="card">
                    <EmptyState icon="clipboard" title="No activity found" description={type || userId ? 'Try another type or person, or clear the filters.' : 'Activity will appear here as people use TaskFlow.'} />
                </div>
            )}

            <div className="mt-6">
                <Pagination page={page} lastPage={lastPage(Number(total), PER_PAGE)} total={Number(total)} perPage={PER_PAGE} href={(p) => withQuery('/admin/activity-logs', { ...filters, page: p })} />
            </div>
        </>
    );
}

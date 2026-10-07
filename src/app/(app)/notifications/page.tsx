import type { Metadata } from 'next';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/app/actions/notifications';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { diffForHumans, formatDate } from '@/lib/dates';
import { NotificationType } from '@/lib/enums';
import { withQuery } from '@/lib/urls';
import { lastPage, paging } from '@/lib/views';
import { Icon } from '@/components/icon';
import { EmptyState, PageHeader, Pagination } from '@/components/ui';

export const metadata: Metadata = { title: 'Notifications' };

const PER_PAGE = 20;
const { notifications } = schema;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const { page, offset } = paging(await searchParams, PER_PAGE);
    const mine = eq(notifications.userId, user.id);

    const [{ total }] = await db().select({ total: count() }).from(notifications).where(mine);
    const [{ unread }] = await db()
        .select({ unread: count() })
        .from(notifications)
        .where(and(mine, isNull(notifications.readAt)));
    const rows = await db().select().from(notifications).where(mine).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(PER_PAGE).offset(offset);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Notifications"
                description="Updates about your tasks and projects."
                className="mb-0"
                actions={
                    Number(unread) > 0 && (
                        <form action={markAllNotificationsReadAction}>
                            <button className="btn-secondary" type="submit">
                                <Icon name="check" className="h-4 w-4" /> Mark all read
                            </button>
                        </form>
                    )
                }
            />

            <div className="card divide-y divide-slate-100">
                {rows.length ? (
                    rows.map((n) => {
                        const type = NotificationType.is(n.type) ? NotificationType.meta[n.type] : { icon: 'bell', color: 'slate' };
                        return (
                            <div key={n.id} className={`flex gap-3 p-4 ${n.readAt ? 'bg-white' : 'bg-indigo-50/40'}`}>
                                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-${type.color}-100 text-${type.color}-700`}>
                                    <Icon name={type.icon} className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <a href={`/notifications/${n.id}/open`} className="block text-sm font-semibold text-slate-900 hover:text-indigo-700">
                                        {n.title}
                                    </a>
                                    {n.message && <p className="mt-1 text-sm text-slate-600">{n.message}</p>}
                                    <p className="mt-2 text-xs text-slate-400" title={formatDate(n.createdAt, 'M j, Y g:i A')}>
                                        {diffForHumans(n.createdAt)}
                                    </p>
                                </div>
                                {!n.readAt && (
                                    <form action={markNotificationReadAction.bind(null, n.id)}>
                                        <button className="btn-ghost btn-sm text-xs whitespace-nowrap" type="submit">
                                            Mark read
                                        </button>
                                    </form>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <EmptyState icon="bell" title="You're all caught up" description="New task and collaboration updates will appear here." />
                )}
            </div>

            <Pagination page={page} lastPage={lastPage(Number(total), PER_PAGE)} total={Number(total)} perPage={PER_PAGE} href={(p) => withQuery('/notifications', { page: p })} />
        </div>
    );
}

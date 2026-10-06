import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { apiUser, noStore } from '@/lib/api';
import { db, schema } from '@/lib/db';
import { diffForHumans } from '@/lib/dates';
import { NotificationType } from '@/lib/enums';
import { initials, usersByIds } from '@/lib/users';

/** The bell dropdown: the ten latest notifications and the unread count. */
export async function GET() {
    const user = await apiUser();
    if (user instanceof NextResponse) return user;

    const { notifications } = schema;
    const rows = await db().select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(10);
    const [{ unread }] = await db()
        .select({ unread: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    const actors = await usersByIds(rows.map((r) => r.actorId).filter((id): id is number => id !== null));

    return NextResponse.json(
        {
            unread_count: Number(unread),
            data: rows.map((n) => {
                const type = NotificationType.is(n.type) ? NotificationType.meta[n.type] : { icon: 'bell', color: 'slate' };
                const actor = n.actorId ? actors.get(n.actorId) : null;
                return {
                    id: n.id,
                    type: n.type,
                    title: n.title,
                    message: n.message,
                    icon: type.icon,
                    color: type.color,
                    read: n.readAt !== null,
                    time: diffForHumans(n.createdAt),
                    open_url: `/notifications/${n.id}/open`,
                    actor: actor ? { name: actor.name, initials: initials(actor.name), avatar_color: actor.avatarColor } : null,
                };
            }),
        },
        noStore,
    );
}

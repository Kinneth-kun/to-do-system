'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { now } from '@/lib/dates';
import { done } from '@/lib/flash';

export async function markNotificationReadAction(notificationId: number): Promise<void> {
    const user = await requireUser();
    const updated = await db()
        .update(schema.notifications)
        .set({ readAt: now() })
        .where(and(eq(schema.notifications.id, notificationId), eq(schema.notifications.userId, user.id)))
        .returning({ id: schema.notifications.id });
    // Someone else's notification is indistinguishable from one that doesn't exist.
    if (!updated.length) notFound();
    await done('success', 'Notification marked as read.');
}

export async function markAllNotificationsReadAction(): Promise<void> {
    const user = await requireUser();
    await db()
        .update(schema.notifications)
        .set({ readAt: now() })
        .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
    await done('success', 'All notifications marked as read.');
}

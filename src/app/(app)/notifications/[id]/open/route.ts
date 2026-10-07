import { and, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { now } from '@/lib/dates';
import { safeRelativePath } from '@/lib/urls';

/**
 * Mark a notification read and follow its link. Notification URLs are written server-side, but
 * this is a one-click redirect for a signed-in user — it only ever sends them somewhere on this
 * site, and another person's notification is indistinguishable from a missing one.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !user.isActive) return NextResponse.redirect(new URL('/login', request.url));

    const id = Number((await params).id);
    const [notification] = Number.isInteger(id)
        ? await db()
              .select()
              .from(schema.notifications)
              .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, user.id)))
        : [];
    if (!notification) return new NextResponse('Not Found', { status: 404 });

    if (!notification.readAt) {
        await db().update(schema.notifications).set({ readAt: now() }).where(eq(schema.notifications.id, id));
    }

    const target = safeRelativePath(notification.url) ?? '/notifications';
    return NextResponse.redirect(new URL(target, request.url));
}

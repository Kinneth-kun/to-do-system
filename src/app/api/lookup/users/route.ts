import { and, asc, eq, or, sql } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { projectAlive, projectVisibleTo } from '@/lib/access';
import { apiUser, noStore } from '@/lib/api';
import { db, schema } from '@/lib/db';
import { contains } from '@/lib/search';
import { initials } from '@/lib/users';

/**
 * Directory lookup for pickers and @mentions: ?q=&project_id=&limit=10. Active users only; with a
 * project, its members come first. Deliberately never returns email addresses — every signed-in
 * account can call this, so returning them would hand over the whole staff directory.
 */
export async function GET(request: NextRequest) {
    const user = await apiUser({ throttle: true });
    if (user instanceof NextResponse) return user;

    const params = request.nextUrl.searchParams;
    const q = (params.get('q') ?? '').trim().slice(0, 100);
    const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 10));
    const projectId = /^\d+$/.test(params.get('project_id') ?? '') ? Number(params.get('project_id')) : null;

    if (projectId) {
        const [visible] = await db()
            .select({ id: schema.projects.id })
            .from(schema.projects)
            .where(and(eq(schema.projects.id, projectId), projectAlive, projectVisibleTo(user)));
        if (!visible) return NextResponse.json({ message: 'Not Found' }, { status: 404 });
    }

    const users = await db()
        .select({ id: schema.users.id, name: schema.users.name, username: schema.users.username, jobTitle: schema.users.jobTitle, avatarColor: schema.users.avatarColor })
        .from(schema.users)
        .where(and(eq(schema.users.isActive, true), q ? or(contains(schema.users.name, q), contains(schema.users.username, q)) : undefined))
        .orderBy(
            ...(projectId ? [sql`case when exists (select 1 from project_members pm where pm.user_id = ${schema.users.id} and pm.project_id = ${projectId}) then 0 else 1 end`] : []),
            asc(schema.users.name),
        )
        .limit(limit);

    return NextResponse.json(
        { data: users.map((u) => ({ id: u.id, name: u.name, username: u.username, job_title: u.jobTitle, initials: initials(u.name), avatar_color: u.avatarColor })) },
        noStore,
    );
}

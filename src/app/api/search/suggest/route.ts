import { and, asc, desc, eq, or } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { projectAlive, projectVisibleTo, taskAlive, taskVisibleTo } from '@/lib/access';
import { apiUser, noStore } from '@/lib/api';
import { db, schema } from '@/lib/db';
import { ProjectHealth, TaskStatus, taskStatusColor } from '@/lib/enums';
import { contains } from '@/lib/search';
import { usersByIds } from '@/lib/users';

/** Grouped suggestions for the top bar search (projects, tasks, users — 5 each). */
export async function GET(request: NextRequest) {
    const user = await apiUser({ throttle: true });
    if (user instanceof NextResponse) return user;

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100);
    if (!q) return NextResponse.json({ query: '', groups: [] }, noStore);

    const projects = await db()
        .select({ id: schema.projects.id, name: schema.projects.name, health: schema.projects.health, ownerId: schema.projects.ownerId })
        .from(schema.projects)
        .where(and(projectAlive, projectVisibleTo(user), contains(schema.projects.name, q)))
        .orderBy(desc(schema.projects.createdAt))
        .limit(5);
    const tasks = await db()
        .select({ id: schema.tasks.id, title: schema.tasks.title, status: schema.tasks.status, project: schema.projects.name })
        .from(schema.tasks)
        .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
        .where(and(taskAlive, taskVisibleTo(user), contains(schema.tasks.title, q)))
        .orderBy(desc(schema.tasks.createdAt))
        .limit(5);
    const people = await db()
        .select({ id: schema.users.id, name: schema.users.name, username: schema.users.username })
        .from(schema.users)
        .where(and(eq(schema.users.isActive, true), or(contains(schema.users.name, q), contains(schema.users.username, q))))
        .orderBy(asc(schema.users.name))
        .limit(5);
    const owners = await usersByIds(projects.map((p) => p.ownerId));

    const taskItem = (t: (typeof tasks)[number]) => ({
        id: t.id,
        title: t.title,
        subtitle: t.project ?? 'Standalone task',
        url: `/tasks/${t.id}`,
        badge: { label: TaskStatus.label(t.status as TaskStatus), color: taskStatusColor(t.status as TaskStatus) },
    });

    const groups = [
        {
            key: 'projects',
            label: 'Projects',
            items: projects.map((p) => ({
                id: p.id,
                title: p.name,
                subtitle: owners.get(p.ownerId)?.name ?? 'Project',
                url: `/projects/${p.id}`,
                badge: { label: ProjectHealth.label(p.health as ProjectHealth), color: ProjectHealth.meta[p.health as ProjectHealth]?.color ?? 'slate' },
            })),
        },
        { key: 'tasks', label: 'Tasks', items: tasks.map(taskItem) },
        { key: 'users', label: 'Users', items: people.map((u) => ({ id: u.id, title: u.name, subtitle: u.username, url: `/search?q=${encodeURIComponent(u.username)}`, badge: null })) },
    ].filter((g) => g.items.length > 0);

    return NextResponse.json({ query: q, groups }, noStore);
}

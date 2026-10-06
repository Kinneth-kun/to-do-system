import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { ROLE_ADMIN, ROLE_EXECUTIVE, ROLE_USER } from '@/lib/enums';
import { createUser, roleId } from '@/lib/users';
import type { Actor } from '@/lib/access';

let sequence = 0;

export type TestUser = { id: number; name: string; username: string; email: string; isAdmin: boolean; fullAccess: boolean };

export async function makeUser(attributes: Partial<Parameters<typeof createUser>[0]> & { admin?: boolean; executive?: boolean } = {}): Promise<TestUser> {
    sequence++;
    const { admin, executive, ...rest } = attributes;
    const user = await createUser({
        name: `Person ${sequence}`,
        email: `person${sequence}@example.com`,
        password: 'Password123',
        department: 'operations',
        roleId: await roleId(admin ? ROLE_ADMIN : executive ? ROLE_EXECUTIVE : ROLE_USER),
        ...rest,
    });
    return { id: user.id, name: user.name, username: user.username, email: user.email, isAdmin: !!admin, fullAccess: !!admin || !!executive };
}

export const actor = (u: TestUser): Actor => ({ id: u.id, fullAccess: u.fullAccess });

export async function task(id: number) {
    const [row] = await db().select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return row;
}

export async function project(id: number) {
    const [row] = await db().select().from(schema.projects).where(eq(schema.projects.id, id));
    return row;
}

export async function notificationsFor(userId: number, type?: string) {
    return db()
        .select()
        .from(schema.notifications)
        .where(and(eq(schema.notifications.userId, userId), type ? eq(schema.notifications.type, type) : undefined));
}

export async function history(taskId: number) {
    return db().select().from(schema.taskUpdates).where(eq(schema.taskUpdates.taskId, taskId)).orderBy(schema.taskUpdates.id);
}

export async function activity(action: string) {
    return db().select().from(schema.activityLogs).where(eq(schema.activityLogs.action, action));
}

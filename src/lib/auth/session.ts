import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { forbidden, redirect } from 'next/navigation';
import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { now } from '../dates';
import { FULL_ACCESS_ROLES, ROLE_ADMIN, type Department, type RoleName } from '../enums';
import { requestMeta } from '../request-context';
import { DeadlineService } from '../services/deadlines';
import { routes } from '../urls';

/*
 * Session authentication, replacing Laravel's session guard.
 *
 * The cookie carries a random 256-bit token; the database stores only its SHA-256, so a leaked
 * sessions table cannot be replayed. "Keep me signed in" sessions last 30 days; others expire
 * after SESSION_LIFETIME minutes of inactivity (120 by default, as in the Laravel app).
 */

export const SESSION_COOKIE = 'taskflow_session';
const IDLE_MINUTES = Number(process.env.SESSION_LIFETIME ?? 120);
const REMEMBER_DAYS = 30;

export type CurrentUser = {
    id: number;
    name: string;
    username: string;
    email: string;
    jobTitle: string | null;
    department: Department | null;
    avatarColor: string;
    isActive: boolean;
    roleId: number;
    role: RoleName;
    /** Administrator only: user management and settings. */
    isAdmin: boolean;
    /** Administrator or executive: sees every project and task, plus the management pages. */
    fullAccess: boolean;
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function cookieOptions(remember: boolean) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        ...(remember ? { maxAge: REMEMBER_DAYS * 86_400 } : {}),
    };
}

/** Start a session for the user and set the cookie (Server Actions / Route Handlers only). */
export async function startSession(userId: number, remember: boolean): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const meta = await requestMeta();
    const at = now();
    const expiresAt = new Date(at.getTime() + (remember ? REMEMBER_DAYS * 86_400_000 : IDLE_MINUTES * 60_000));

    await db().insert(schema.sessions).values({
        id: hashToken(token),
        userId,
        remember,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        lastActivity: at,
        expiresAt,
        createdAt: at,
    });

    (await cookies()).set(SESSION_COOKIE, token, cookieOptions(remember));
}

/** End the current session and clear the cookie (Server Actions / Route Handlers only). */
export async function endSession(): Promise<void> {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) await db().delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
    jar.delete(SESSION_COOKIE);
}

/** Sign a user out everywhere (deactivation, admin password reset). */
export async function endAllSessions(userId: number): Promise<void> {
    await db().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** The signed-in user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const id = hashToken(token);
    const [row] = await db()
        .select({
            session: schema.sessions,
            user: {
                id: schema.users.id,
                name: schema.users.name,
                username: schema.users.username,
                email: schema.users.email,
                jobTitle: schema.users.jobTitle,
                department: schema.users.department,
                avatarColor: schema.users.avatarColor,
                isActive: schema.users.isActive,
                roleId: schema.users.roleId,
            },
            roleName: schema.roles.name,
        })
        .from(schema.sessions)
        .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
        .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
        .where(eq(schema.sessions.id, id))
        .limit(1);

    if (!row) return null;

    const at = now();
    if (row.session.expiresAt.getTime() <= at.getTime()) {
        await db().delete(schema.sessions).where(eq(schema.sessions.id, id));
        return null;
    }

    // Sliding expiry, written at most once a minute.
    if (at.getTime() - row.session.lastActivity.getTime() > 60_000) {
        const expiresAt = row.session.remember ? row.session.expiresAt : new Date(at.getTime() + IDLE_MINUTES * 60_000);
        await db()
            .update(schema.sessions)
            .set({ lastActivity: at, expiresAt })
            .where(and(eq(schema.sessions.id, id)));
    }

    const role = row.roleName as RoleName;
    return { ...row.user, department: row.user.department as Department | null, role, isAdmin: role === ROLE_ADMIN, fullAccess: FULL_ACCESS_ROLES.includes(role) };
});

/**
 * The signed-in, active user — or a redirect to the login page. Every page and action calls this.
 *
 * Also keeps delayed statuses and deadline reminders current without depending on cron: after
 * the response is sent, at most once every 5 minutes across all instances.
 */
export async function requireUser(): Promise<CurrentUser> {
    const user = await getCurrentUser();
    if (!user) redirect(routes.login());

    if (!user.isActive) {
        // Signs out users who were deactivated while they had an active session.
        await endAllSessions(user.id);
        redirect(`${routes.login()}?deactivated=1`);
    }

    scheduleDeadlineCheck();
    return user;
}

/** Administrator area (users, settings) — everyone else gets the 403 page. */
export async function requireAdmin(): Promise<CurrentUser> {
    const user = await requireUser();
    if (!user.isAdmin) forbidden();
    return user;
}

/** Management area (executive dashboard, meeting mode, activity logs) — administrators and executives. */
export async function requireFullAccess(): Promise<CurrentUser> {
    const user = await requireUser();
    if (!user.fullAccess) forbidden();
    return user;
}

const scheduleDeadlineCheck = cache(() => {
    if (process.env.NODE_ENV === 'test') return;
    after(async () => {
        try {
            await DeadlineService.runThrottled(300);
        } catch (error) {
            console.warn('Deadline check failed:', (error as Error).message);
        }
    });
});

import { eq, or, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { logActivity } from '../activity';
import { now } from '../dates';
import { Settings } from '../settings';
import { verifyPassword } from './password';

export const GENERIC_LOGIN_ERROR = 'These credentials do not match our records.';
export const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Please contact your administrator.';

export type LoginResult = { ok: true; userId: number; name: string } | { ok: false; message: string };

const isLocked = (lockedUntil: Date | null) => lockedUntil !== null && lockedUntil.getTime() > now().getTime();

/**
 * Sign in with an email address or username.
 *
 * Brute-force protection is two-layered: a per-IP throttle in the login action, and a
 * per-account lockout here — after `security.max_login_attempts` consecutive failures the
 * account is locked for `security.lockout_minutes` (admins can clear it from the Users screen).
 *
 * The specific "locked" and "deactivated" messages are only shown to someone who supplied the
 * correct password. Everyone else gets one generic message, so login cannot be used to work out
 * which email addresses or usernames exist.
 */
export async function attemptLogin(login: string, password: string, ip: string | null): Promise<LoginResult> {
    const [user] = await db()
        .select()
        .from(schema.users)
        .where(or(sql`lower(${schema.users.email}) = lower(${login})`, sql`lower(${schema.users.username}) = lower(${login})`))
        .limit(1);

    const passwordMatches = user !== undefined && (await verifyPassword(password, user.password));

    // Locked accounts are refused even when the password is right.
    if (user && isLocked(user.lockedUntil)) {
        await logActivity('auth.locked', `Sign-in attempt on locked account ${user.name}`, { type: 'user', id: user.id }, { locked_until: user.lockedUntil?.toISOString() }, null);
        if (!passwordMatches) return { ok: false, message: GENERIC_LOGIN_ERROR };
        const minutes = Math.max(1, Math.ceil((user.lockedUntil!.getTime() - now().getTime()) / 60_000));
        return { ok: false, message: `This account is locked for another ${minutes} minutes. Ask an administrator to unlock it.` };
    }

    if (!passwordMatches) {
        if (user) await registerFailure(user);
        return { ok: false, message: GENERIC_LOGIN_ERROR };
    }

    if (!user.isActive) {
        await logActivity('auth.failed', `Sign-in attempt on deactivated account ${user.name}`, { type: 'user', id: user.id }, {}, null);
        return { ok: false, message: DEACTIVATED_MESSAGE };
    }

    await db()
        .update(schema.users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now(), lastLoginIp: ip, updatedAt: now() })
        .where(eq(schema.users.id, user.id));

    await logActivity('auth.login', `${user.name} signed in`, { type: 'user', id: user.id }, {}, user.id);

    return { ok: true, userId: user.id, name: user.name };
}

/** Count the failure and lock the account once it crosses the configured threshold. */
async function registerFailure(user: typeof schema.users.$inferSelect): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const limit = Math.max(1, await Settings.int('security.max_login_attempts'));

    if (attempts >= limit) {
        const minutes = Math.max(1, await Settings.int('security.lockout_minutes'));
        await db()
            .update(schema.users)
            .set({ failedLoginAttempts: 0, lockedUntil: new Date(now().getTime() + minutes * 60_000), updatedAt: now() })
            .where(eq(schema.users.id, user.id));
        await logActivity('auth.locked', `${user.name} was locked out after ${attempts} failed attempts`, { type: 'user', id: user.id }, { attempts, minutes }, null);
        return;
    }

    await db().update(schema.users).set({ failedLoginAttempts: attempts, updatedAt: now() }).where(eq(schema.users.id, user.id));
    await logActivity('auth.failed', `Failed sign-in attempt for ${user.name}`, { type: 'user', id: user.id }, { attempts, remaining: limit - attempts }, null);
}

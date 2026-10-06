import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, schema } from '@/lib/db';
import { attemptLogin, GENERIC_LOGIN_ERROR } from '@/lib/auth/login';
import { hashPassword, passwordRuleError, verifyPassword } from '@/lib/auth/password';
import { now } from '@/lib/dates';
import { Settings } from '@/lib/settings';
import { activity, makeUser } from './helpers';

const PASSWORD = 'CorrectHorse9';

async function person(attributes: Parameters<typeof makeUser>[0] = {}) {
    return makeUser({ email: 'target@example.com', username: 'target', password: PASSWORD, ...attributes });
}

async function row(id: number) {
    const [user] = await db().select().from(schema.users).where(eq(schema.users.id, id));
    return user;
}

describe('login', () => {
    it('accepts an email or a username, case-insensitively', async () => {
        await person();
        expect((await attemptLogin('target@example.com', PASSWORD, null)).ok).toBe(true);
        expect((await attemptLogin('TARGET', PASSWORD, null)).ok).toBe(true);
    });

    it('counts failed attempts and clears them on success', async () => {
        const user = await person();
        await attemptLogin('target@example.com', 'wrong', null);
        await attemptLogin('target@example.com', 'wrong', null);
        expect((await row(user.id)).failedLoginAttempts).toBe(2);

        expect((await attemptLogin('target@example.com', PASSWORD, '10.0.0.1')).ok).toBe(true);
        const after = await row(user.id);
        expect(after.failedLoginAttempts).toBe(0);
        expect(after.lastLoginAt).not.toBeNull();
        expect(after.lastLoginIp).toBe('10.0.0.1');
    });

    it('locks the account after the configured number of failures', async () => {
        await Settings.set({ 'security.max_login_attempts': 3, 'security.lockout_minutes': 15 });
        const user = await person();
        for (let i = 0; i < 3; i++) await attemptLogin('target@example.com', 'wrong', null);

        const locked = await row(user.id);
        expect(locked.lockedUntil!.getTime()).toBeGreaterThan(now().getTime() + 14 * 60_000);
        // Nobody is signed in during a failed attempt, so the actor stays null.
        const [log] = await activity('auth.locked');
        expect(log).toMatchObject({ subjectType: 'user', subjectId: user.id, userId: null });
    });

    it('refuses a locked account even with the right password, and says so only to the owner', async () => {
        const user = await person();
        await db().update(schema.users).set({ lockedUntil: new Date(now().getTime() + 10 * 60_000) }).where(eq(schema.users.id, user.id));

        const right = await attemptLogin('target@example.com', PASSWORD, null);
        expect(right).toMatchObject({ ok: false });
        expect(right.ok === false && right.message).toContain('locked');

        const wrong = await attemptLogin('target@example.com', 'nope', null);
        expect(wrong).toEqual({ ok: false, message: GENERIC_LOGIN_ERROR });
    });

    it('lets the lock expire on its own', async () => {
        const user = await person();
        await db().update(schema.users).set({ lockedUntil: new Date(now().getTime() - 60_000) }).where(eq(schema.users.id, user.id));
        expect((await attemptLogin('target@example.com', PASSWORD, null)).ok).toBe(true);
    });

    it('does not reveal which accounts exist', async () => {
        await person();
        expect(await attemptLogin('target@example.com', 'wrong', null)).toEqual(await attemptLogin('nobody@example.com', 'wrong', null));
    });

    it('refuses deactivated accounts', async () => {
        const user = await person({ isActive: false });
        const result = await attemptLogin('target@example.com', PASSWORD, null);
        expect(result.ok).toBe(false);
        expect((await activity('auth.failed'))[0]).toMatchObject({ subjectId: user.id });
    });
});

describe('passwords', () => {
    it('applies the Laravel default rule: 8+ characters with letters and numbers', () => {
        expect(passwordRuleError('short1')).not.toBeNull();
        expect(passwordRuleError('lettersonly')).not.toBeNull();
        expect(passwordRuleError('12345678')).not.toBeNull();
        expect(passwordRuleError('Letters123')).toBeNull();
    });

    it('verifies hashes written by the Laravel app ($2y$)', async () => {
        // PHP's password_hash() writes "$2y$"; the algorithm is the same bcrypt.
        const laravelStyle = (await hashPassword('password')).replace(/^\$2[ab]\$/, '$2y$');
        expect(laravelStyle.startsWith('$2y$')).toBe(true);
        expect(await verifyPassword('password', laravelStyle)).toBe(true);
        expect(await verifyPassword('wrong', laravelStyle)).toBe(false);
    });
});

import { eq } from 'drizzle-orm';
import { db, schema } from '.';
import { hashPassword } from '../auth/password';
import { now } from '../dates';
import { ROLE_ADMIN, ROLE_EXECUTIVE, ROLE_USER } from '../enums';
import { createUser, roleId, usernameTaken } from '../users';

/*
 * Production-safe seed: the two roles and one administrator, defined by environment variables so
 * no credential is ever committed:
 *
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD
 *
 * Administrators don't belong to a department and have no job title.
 *
 * Re-running updates the existing account instead of creating a duplicate. The password is only
 * written when ADMIN_PASSWORD is set, so a later seed never silently resets a password that was
 * changed inside the app.
 */
export async function seedBasics(log: (line: string) => void = console.log): Promise<void> {
    await roleId(ROLE_ADMIN);
    await roleId(ROLE_EXECUTIVE);
    await roleId(ROLE_USER);

    const email = process.env.ADMIN_EMAIL?.trim();
    if (!email) {
        log('ADMIN_EMAIL is not set — skipping administrator creation.');
        return;
    }

    const adminRole = await roleId(ROLE_ADMIN);
    const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
    const username = process.env.ADMIN_USERNAME?.trim() || null;
    const password = process.env.ADMIN_PASSWORD || null;

    const [existing] = await db().select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

    if (!existing) {
        if (!password) {
            log('ADMIN_PASSWORD is not set — the administrator was not created.');
            return;
        }
        const user = await createUser({ name, email, password, username, roleId: adminRole, department: null, jobTitle: null, isActive: true, emailVerifiedAt: now() });
        log(`Created administrator ${user.email} (username: ${user.username})`);
        return;
    }

    const updates: Partial<typeof schema.users.$inferInsert> = { roleId: adminRole, name, department: null, jobTitle: null, isActive: true, updatedAt: now() };
    if (username && username !== existing.username) {
        if (await usernameTaken(username, existing.id)) log(`Username "${username}" is taken by someone else — keeping "${existing.username}".`);
        else updates.username = username;
    }
    if (password) updates.password = await hashPassword(password);
    updates.emailVerifiedAt = existing.emailVerifiedAt ?? now();

    await db().update(schema.users).set(updates).where(eq(schema.users.id, existing.id));
    log(`Updated administrator ${email} (username: ${updates.username ?? existing.username})`);
}

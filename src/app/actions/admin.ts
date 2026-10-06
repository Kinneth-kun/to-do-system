'use server';

import { and, count, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { logActivity } from '@/lib/activity';
import { hashPassword, passwordRuleError } from '@/lib/auth/password';
import { endAllSessions, requireAdmin } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { now } from '@/lib/dates';
import { Department, ROLE_ADMIN } from '@/lib/enums';
import { done, flash } from '@/lib/flash';
import { ProjectHealthService } from '@/lib/services/health';
import { SETTING_DEFINITIONS, Settings, type SettingKey } from '@/lib/settings';
import { createUser, emailTaken, usernameTaken } from '@/lib/users';
import { Validator, type FormState } from '@/lib/validation';

/* ------------------------------------------------------------------ users */

async function findUser(id: number) {
    const [row] = await db()
        .select({ user: schema.users, roleName: schema.roles.name })
        .from(schema.users)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
        .where(eq(schema.users.id, id));
    if (!row) notFound();
    return { ...row.user, isAdmin: row.roleName === ROLE_ADMIN, roleName: row.roleName };
}

async function adminCount(onlyActive = false): Promise<number> {
    const [row] = await db()
        .select({ c: count() })
        .from(schema.users)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
        .where(and(eq(schema.roles.name, ROLE_ADMIN), onlyActive ? eq(schema.users.isActive, true) : undefined));
    return Number(row.c);
}

async function validateUser(v: Validator, ignoreId?: number) {
    const data = {
        name: v.string('name', { required: true, max: 255 }),
        username: v.string('username', { required: true, max: 50, regex: /^[A-Za-z0-9._-]+$/ }),
        email: v.string('email', { required: true, max: 255, email: true }),
        jobTitle: v.string('job_title', { max: 255 }),
        department: v.oneOf('department', Department.values, { required: true }),
        roleId: v.int('role_id', { required: true, label: 'role' }),
    };
    if (data.username && (await usernameTaken(data.username, ignoreId))) v.fail('username', 'The username has already been taken.');
    if (data.email && (await emailTaken(data.email, ignoreId))) v.fail('email', 'The email has already been taken.');
    if (data.roleId) {
        const [role] = await db().select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.id, data.roleId));
        if (!role) v.fail('role_id', 'The selected role is invalid.');
    }
    return data;
}

function validatePassword(v: Validator) {
    const password = v.string('password', { required: true, keepWhitespace: true });
    v.confirmed('password');
    const rule = password ? passwordRuleError(password) : null;
    if (rule) v.fail('password', rule);
    return password;
}

export async function createUserAction(_: FormState, formData: FormData): Promise<FormState> {
    const admin = await requireAdmin();
    const v = new Validator(formData);
    const data = await validateUser(v);
    const password = validatePassword(v);
    if (v.fails()) return v.state();

    const user = await createUser({ ...data, name: data.name!, email: data.email!, password: password!, roleId: data.roleId! });
    const [role] = await db().select({ name: schema.roles.name }).from(schema.roles).where(eq(schema.roles.id, user.roleId));
    await logActivity('user.created', `Created user ${user.name}`, { type: 'user', id: user.id }, { role: role?.name }, admin.id);

    await flash('success', 'User created.');
    redirect('/admin/users');
}

export async function updateUserAction(userId: number, _: FormState, formData: FormData): Promise<FormState> {
    const admin = await requireAdmin();
    const user = await findUser(userId);
    const v = new Validator(formData);
    const data = await validateUser(v, userId);
    if (v.fails()) return v.state();

    const [requestedRole] = await db().select().from(schema.roles).where(eq(schema.roles.id, data.roleId!));
    if (user.id === admin.id && user.roleId !== requestedRole.id) {
        return v.state({ _form: 'You cannot change your own administrator role.' });
    }
    if (user.isAdmin && requestedRole.name !== ROLE_ADMIN && (await adminCount()) <= 1) {
        return v.state({ _form: 'The system must keep at least one administrator.' });
    }

    await db()
        .update(schema.users)
        .set({
            name: data.name!,
            username: data.username!,
            email: data.email!,
            jobTitle: data.jobTitle,
            department: data.department,
            roleId: requestedRole.id,
            updatedAt: now(),
        })
        .where(eq(schema.users.id, userId));
    await logActivity('user.updated', `Updated user ${data.name}`, { type: 'user', id: userId }, {}, admin.id);
    if (user.roleName !== requestedRole.name) {
        await logActivity('user.role_changed', `Changed ${data.name} role from ${user.roleName} to ${requestedRole.name}`, { type: 'user', id: userId }, { from: user.roleName, to: requestedRole.name }, admin.id);
    }

    await done('success', 'User updated.');
    return { ok: true };
}

export async function toggleUserActiveAction(userId: number): Promise<void> {
    const admin = await requireAdmin();
    const user = await findUser(userId);
    if (user.id === admin.id) return done('error', 'You cannot deactivate your own account.');
    if (user.isActive && user.isAdmin && (await adminCount(true)) <= 1) return done('error', 'The last active administrator cannot be deactivated.');

    const isActive = !user.isActive;
    await db().update(schema.users).set({ isActive, updatedAt: now() }).where(eq(schema.users.id, userId));
    // Deactivated people are signed out everywhere immediately.
    if (!isActive) await endAllSessions(userId);
    const action = isActive ? 'activated' : 'deactivated';
    await logActivity(`user.${action}`, `${isActive ? 'Activated' : 'Deactivated'} user ${user.name}`, { type: 'user', id: userId }, {}, admin.id);

    await done('success', `User ${action}.`);
}

export async function unlockUserAction(userId: number): Promise<void> {
    const admin = await requireAdmin();
    const user = await findUser(userId);
    await db().update(schema.users).set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: now() }).where(eq(schema.users.id, userId));
    await logActivity('user.unlocked', `Unlocked user ${user.name}`, { type: 'user', id: userId }, {}, admin.id);
    await done('success', 'User unlocked.');
}

export async function resetUserPasswordAction(userId: number, _: FormState, formData: FormData): Promise<FormState> {
    const admin = await requireAdmin();
    const user = await findUser(userId);
    const v = new Validator(formData);
    const password = validatePassword(v);
    if (v.fails()) return v.state();

    await db()
        .update(schema.users)
        .set({ password: await hashPassword(password!), failedLoginAttempts: 0, lockedUntil: null, updatedAt: now() })
        .where(eq(schema.users.id, userId));
    if (userId !== admin.id) await endAllSessions(userId);
    await logActivity('user.password_reset', `Reset password for ${user.name}`, { type: 'user', id: userId }, {}, admin.id);

    await done('success', 'Password reset.');
    return { ok: true };
}

/* ------------------------------------------------------------------ settings */

export async function updateSettingsAction(_: FormState, formData: FormData): Promise<FormState> {
    const admin = await requireAdmin();
    const v = new Validator(formData);
    const values: Partial<Record<SettingKey, unknown>> = {};

    for (const [key, def] of Object.entries(SETTING_DEFINITIONS) as [SettingKey, (typeof SETTING_DEFINITIONS)[SettingKey]][]) {
        const label = def.label;
        if (def.type === 'bool') values[key] = v.bool(key);
        else if (def.type === 'int') values[key] = v.int(key, { required: true, label, min: 'min' in def ? def.min : undefined, max: 'max' in def ? def.max : undefined });
        else values[key] = v.string(key, { required: true, max: 255, label });
    }
    if (v.fails()) return v.state();

    await Settings.set(values);
    await ProjectHealthService.refreshAll();
    await logActivity('settings.updated', 'Updated application settings', null, { keys: Object.keys(values) }, admin.id);

    await done('success', 'Settings updated.');
    return { ok: true };
}

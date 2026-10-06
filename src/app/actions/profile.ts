'use server';

// Account details (name, username, email, department…) are managed by administrators; people
// change only their own password.

import { eq } from 'drizzle-orm';
import { logActivity } from '@/lib/activity';
import { hashPassword, passwordRuleError, verifyPassword } from '@/lib/auth/password';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { now } from '@/lib/dates';
import { done } from '@/lib/flash';
import { Validator, type FormState } from '@/lib/validation';

export async function updatePasswordAction(_: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const v = new Validator(formData);
    const current = v.string('current_password', { required: true, keepWhitespace: true });
    const password = v.string('password', { required: true, keepWhitespace: true });
    v.confirmed('password');
    const rule = password ? passwordRuleError(password) : null;
    if (rule) v.fail('password', rule);
    if (v.fails()) return v.state();

    const [row] = await db().select({ password: schema.users.password }).from(schema.users).where(eq(schema.users.id, user.id));
    if (!(await verifyPassword(current!, row?.password))) return v.state({ current_password: 'The current password is incorrect.' });

    await db().update(schema.users).set({ password: await hashPassword(password!), updatedAt: now() }).where(eq(schema.users.id, user.id));
    await logActivity('profile.password_changed', `${user.name} changed their password`, { type: 'user', id: user.id }, {}, user.id);

    await done('success', 'Your password has been changed.');
    return { ok: true };
}

'use server';

import { redirect } from 'next/navigation';
import { attemptLogin } from '@/lib/auth/login';
import { endSession, getCurrentUser, startSession } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { flash } from '@/lib/flash';
import { rateLimit } from '@/lib/locks';
import { requestMeta } from '@/lib/request-context';
import { safeRelativePath } from '@/lib/urls';
import { Validator, type FormState } from '@/lib/validation';

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
    const v = new Validator(formData);
    const login = v.string('login', { required: true, max: 255 });
    const password = v.string('password', { required: true, keepWhitespace: true });
    if (v.fails()) return v.state();

    // Per-IP throttle (Laravel's throttle:login, 20 a minute), in addition to the per-account lockout.
    const { ip } = await requestMeta();
    const limit = await rateLimit(`login:${ip ?? 'unknown'}`, 20, 60);
    if (!limit.allowed) {
        return v.state({ login: `Too many login attempts. Please try again in ${limit.retryAfter} seconds.` });
    }

    const result = await attemptLogin(login!, password!, ip);
    if (!result.ok) return v.state({ login: result.message });

    await startSession(result.userId, v.bool('remember'));
    redirect(safeRelativePath(String(formData.get('redirect') ?? '')) ?? '/');
}

export async function logoutAction(): Promise<void> {
    const user = await getCurrentUser();
    await endSession();
    if (user) await logActivity('auth.logout', `${user.name} signed out`, { type: 'user', id: user.id }, {}, user.id);
    await flash('success', 'You have been signed out.');
    redirect('/login');
}

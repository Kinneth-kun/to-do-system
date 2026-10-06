import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentUser, type CurrentUser } from './auth/session';
import { rateLimit } from './locks';

/** The signed-in user for a JSON endpoint, or the error response to return instead. */
export async function apiUser(options: { throttle?: boolean } = {}): Promise<CurrentUser | NextResponse> {
    const user = await getCurrentUser();
    if (!user || !user.isActive) return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });

    // Laravel's throttle:lookup — 120 requests a minute per user for pickers and suggestions.
    if (options.throttle) {
        const limit = await rateLimit(`lookup:${user.id}`, 120, 60);
        if (!limit.allowed) {
            return NextResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
        }
    }
    return user;
}

export const noStore = { headers: { 'Cache-Control': 'no-store' } };

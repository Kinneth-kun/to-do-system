import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Vercel Cron calls these endpoints with `Authorization: Bearer $CRON_SECRET` when the project
 * has a CRON_SECRET environment variable. Anything else is refused. Locally (no secret, not in
 * production) they can be opened directly for testing.
 */
export function rejectUnauthorizedCron(request: Request): NextResponse | null {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            return NextResponse.json({ message: 'CRON_SECRET is not configured.' }, { status: 500 });
        }
        return null;
    }
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return null;
}

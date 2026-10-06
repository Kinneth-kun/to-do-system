import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnauthorizedCron } from '@/lib/cron';
import { isoWeekday, today } from '@/lib/dates';
import { sendDailyDigest } from '@/lib/services/digest';

// Every person's AI summary is one API call; give the run the full Hobby-plan budget.
export const maxDuration = 300;

/**
 * The 08:00 weekday briefing (see vercel.json for the schedule). Weekends are skipped in the
 * application's timezone even if the schedule is widened, unless ?force=1.
 * Optional: ?dry_run=1, ?user=<id|username|email>.
 */
export async function GET(request: NextRequest) {
    const denied = rejectUnauthorizedCron(request);
    if (denied) return denied;

    const params = request.nextUrl.searchParams;
    const force = params.get('force') === '1';
    if (!force && isoWeekday(today()) > 5) {
        return NextResponse.json({ skipped: true, reason: 'Weekend in the application timezone.' });
    }

    const result = await sendDailyDigest({ force, dryRun: params.get('dry_run') === '1', user: params.get('user') ?? undefined });
    console.log(result.lines.join('\n'));
    return NextResponse.json(result);
}

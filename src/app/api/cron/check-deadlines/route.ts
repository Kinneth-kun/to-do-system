import { NextResponse } from 'next/server';
import { rejectUnauthorizedCron } from '@/lib/cron';
import { DeadlineService } from '@/lib/services/deadlines';

export const maxDuration = 300;

/** Mark overdue tasks Delayed, send due-soon reminders and refresh project health. */
export async function GET(request: Request) {
    const denied = rejectUnauthorizedCron(request);
    if (denied) return denied;

    const result = await DeadlineService.run();
    console.log(`Marked ${result.delayed} task(s) delayed, sent ${result.reminders} deadline reminder(s), refreshed ${result.projects} project(s).`);
    return NextResponse.json(result);
}

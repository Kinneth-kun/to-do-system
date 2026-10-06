import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { taskInvolving } from '../access';
import { addDays, formatDate, now, today, APP_TIMEZONE } from '../dates';
import { OPEN_STATUSES, TaskStatus } from '../enums';
import { Settings } from '../settings';
import { isDueSoon, isOverdue } from '../task-utils';
import { routes } from '../urls';
import { BriefingService, type Workload, type WorkloadTask } from './briefing';
import { DeadlineService } from './deadlines';

/*
 * The 08:00 weekday briefing: one notification per person summarising what is overdue, due
 * today and coming up. Fired by Vercel Cron (/api/cron/daily-digest) or `npm run digest`.
 * Safe to run more than once — a person receives at most one digest per day unless forced.
 */

export type DigestOptions = { user?: string; dryRun?: boolean; force?: boolean };
export type DigestResult = { sent: number; skipped: number; lines: string[]; disabled?: boolean };

const plural = (n: number, word: string) => (n === 1 ? word : word === 'person' ? 'people' : `${word}s`);

export async function sendDailyDigest(options: DigestOptions = {}): Promise<DigestResult> {
    const lines: string[] = [];

    if (!(await Settings.bool('digest.enabled')) && !options.force) {
        return { sent: 0, skipped: 0, lines: ['The daily briefing is switched off in Settings.'], disabled: true };
    }

    // Make sure overdue work is flagged before we describe it.
    await DeadlineService.markOverdueTasksDelayed();

    const recipients = await db()
        .select({ id: schema.users.id, name: schema.users.name, department: schema.users.department })
        .from(schema.users)
        .where(
            and(
                eq(schema.users.isActive, true),
                options.user
                    ? or(
                          /^\d+$/.test(options.user) ? eq(schema.users.id, Number(options.user)) : undefined,
                          eq(schema.users.username, options.user),
                          eq(schema.users.email, options.user),
                      )
                    : undefined,
            ),
        )
        .orderBy(asc(schema.users.name));

    if (!recipients.length) return { sent: 0, skipped: 0, lines: ['No matching active users.'] };

    const aiEnabled = await BriefingService.enabled();
    lines.push(
        `Preparing briefings for ${recipients.length} ${plural(recipients.length, 'person')}${options.dryRun ? ' (dry run)' : ''}. AI summaries: ${
            aiEnabled ? 'on' : BriefingService.configured() ? 'off in settings' : 'no API key — using plain summaries'
        }.`,
    );

    const includeQuietDays = await Settings.bool('digest.include_quiet_days');
    let sent = 0;
    let skipped = 0;

    // A few people at a time keeps the run well inside a function's time limit when every
    // summary is an API call.
    const queue = [...recipients];
    const worker = async () => {
        for (let user = queue.shift(); user; user = queue.shift()) {
            if (!options.force && (await alreadySentToday(user.id))) {
                lines.push(`  skipped ${user.name} — already briefed today`);
                skipped++;
                continue;
            }

            const workload = await workloadFor(user.id);
            if (workload.open_total === 0 && !includeQuietDays) {
                lines.push(`  skipped ${user.name} — nothing open`);
                skipped++;
                continue;
            }

            const summary = (await BriefingService.summarise(user, workload)) ?? plainSummary(workload);
            const heading = title(workload);

            if (options.dryRun) {
                lines.push(`  would send ${user.name}: ${heading}`, `      ${summary}`);
                sent++;
                continue;
            }

            const at = now();
            await db()
                .insert(schema.notifications)
                .values({
                    userId: user.id,
                    actorId: null,
                    type: 'daily_digest',
                    title: heading,
                    message: summary,
                    url: routes.dashboard(),
                    data: {
                        date: today(),
                        overdue: workload.overdue.length,
                        due_today: workload.due_today.length,
                        due_soon: workload.due_soon.length,
                        open_total: workload.open_total,
                        ai: aiEnabled,
                    },
                    createdAt: at,
                    updatedAt: at,
                });
            lines.push(`  sent ${user.name}: ${heading}`);
            sent++;
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, recipients.length) }, worker));

    lines.push('', `Briefings sent: ${sent}. Skipped: ${skipped}.`);
    return { sent, skipped, lines };
}

const localDate = (column: unknown) => sql`(${column} at time zone ${APP_TIMEZONE})::date`;

async function alreadySentToday(userId: number): Promise<boolean> {
    const rows = await db()
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
            and(
                eq(schema.notifications.userId, userId),
                eq(schema.notifications.type, 'daily_digest'),
                sql`${localDate(schema.notifications.createdAt)} = ${today()}::date`,
            ),
        )
        .limit(1);
    return rows.length > 0;
}

/** Everything the briefing needs for one person: work they are assigned, created or collaborate on. */
export async function workloadFor(userId: number): Promise<Workload> {
    const day = today();
    const dueSoonDays = await Settings.int('deadline.due_soon_days');

    const open = await db()
        .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            status: schema.tasks.status,
            progress: schema.tasks.progress,
            dueDate: schema.tasks.dueDate,
            project: schema.projects.name,
        })
        .from(schema.tasks)
        // Left join: standalone tasks have no project (and so no deleted project to exclude).
        .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
        .where(and(isNull(schema.tasks.deletedAt), isNull(schema.projects.deletedAt), inArray(schema.tasks.status, OPEN_STATUSES), taskInvolving(userId)))
        .orderBy(sql`${schema.tasks.dueDate} is null`, asc(schema.tasks.dueDate));

    const overdue = open.filter((t) => t.status === 'delayed' || isOverdue(t, day));
    const overdueIds = new Set(overdue.map((t) => t.id));
    const dueToday = open.filter((t) => t.dueDate === day && !overdueIds.has(t.id));
    const dueSoon = open.filter((t) => isDueSoon(t, day, dueSoonDays) && t.dueDate !== day);

    const [{ c: completedYesterday }] = await db()
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.tasks)
        .where(
            and(
                isNull(schema.tasks.deletedAt),
                eq(schema.tasks.status, 'completed'),
                sql`${localDate(schema.tasks.completedAt)} = ${addDays(day, -1)}::date`,
                taskInvolving(userId),
            ),
        );

    const describe = (tasks: typeof open, limit = 8): WorkloadTask[] =>
        tasks.slice(0, limit).map((t) => ({
            title: t.title,
            status: TaskStatus.label(t.status as TaskStatus),
            progress: t.progress,
            project: t.project,
            due: t.dueDate ? formatDate(t.dueDate, 'j M') : null,
        }));

    return {
        open_total: open.length,
        overdue: describe(overdue),
        due_today: describe(dueToday),
        due_soon: describe(dueSoon.slice(0, 5)),
        completed_yesterday: Number(completedYesterday),
    };
}

function title(workload: Workload): string {
    const overdue = workload.overdue.length;
    const dueToday = workload.due_today.length;
    if (overdue > 0 && dueToday > 0) return `${overdue} overdue, ${dueToday} due today`;
    if (overdue > 0) return `${overdue} overdue ${plural(overdue, 'task')}`;
    if (dueToday > 0) return `${dueToday} ${plural(dueToday, 'task')} due today`;
    return `Your day: ${workload.open_total} open ${plural(workload.open_total, 'task')}`;
}

/** Used when AI summaries are unavailable — the digest still has to say something useful. */
export function plainSummary(workload: Workload): string {
    const parts: string[] = [];
    if (workload.overdue.length) {
        parts.push(`${workload.overdue.length} ${plural(workload.overdue.length, 'task')} past their due date, starting with "${workload.overdue[0].title}"`);
    }
    if (workload.due_today.length) parts.push(`${workload.due_today.length} due today`);
    if (workload.due_soon.length) parts.push(`${workload.due_soon.length} due in the next few days`);

    if (!parts.length) {
        return `Nothing is overdue or due shortly. You have ${workload.open_total} open ${plural(workload.open_total, 'task')} in total.`;
    }

    return `You have ${parts.join(', ')}.${workload.completed_yesterday > 0 ? ` You completed ${workload.completed_yesterday} yesterday.` : ''}`;
}

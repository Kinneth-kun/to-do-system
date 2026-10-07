import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { addDays, today } from '../dates';
import { acquireLock, pruneExpired } from '../locks';
import { loadTaskInfo, Notify } from '../notifications';
import { Settings } from '../settings';
import { dueLabel } from '../task-utils';
import { ProjectHealthService } from './health';
import { TaskService } from './tasks';

/*
 * Automatic delay detection and deadline reminders.
 *
 * Runs from Vercel Cron (/api/cron/check-deadlines) and, so the app stays current between cron
 * runs, lazily after authenticated requests — at most once every 5 minutes across all instances.
 */

const { tasks, notifications } = schema;

/** Standalone tasks, or tasks whose project hasn't been deleted. */
const liveProject = sql`(${tasks.projectId} is null or exists (select 1 from projects p where p.id = ${tasks.projectId} and p.deleted_at is null))`;

export const DeadlineService = {
    async run(): Promise<{ delayed: number; reminders: number; projects: number }> {
        const delayed = await DeadlineService.markOverdueTasksDelayed();
        const reminders = await DeadlineService.sendDeadlineReminders();
        const refreshed = await ProjectHealthService.refreshAll();
        await pruneExpired();
        return { delayed, reminders, projects: refreshed };
    },

    /** Run at most once per `seconds` across every instance. */
    async runThrottled(seconds = 300): Promise<boolean> {
        if (!(await acquireLock('taskflow.deadline-check', seconds))) return false;
        await DeadlineService.run();
        return true;
    },

    async markOverdueTasksDelayed(): Promise<number> {
        if (!(await Settings.bool('deadline.auto_delay_enabled'))) return 0;

        const overdue = await db()
            .select()
            .from(tasks)
            .where(and(isNull(tasks.deletedAt), inArray(tasks.status, ['pending', 'in_progress']), isNotNull(tasks.dueDate), lt(tasks.dueDate, today()), liveProject))
            .orderBy(tasks.id);

        let count = 0;
        const touchedProjects = new Set<number>();

        for (const task of overdue) {
            if (await TaskService.syncDelay(task)) {
                count++;
                if (task.projectId) touchedProjects.add(task.projectId);
            }
        }

        for (const projectId of touchedProjects) await ProjectHealthService.refresh(projectId);

        return count;
    },

    /** Notify assignee + collaborators once per task per due date when inside the due-soon window. */
    async sendDeadlineReminders(): Promise<number> {
        const day = today();
        const window = await Settings.int('deadline.due_soon_days');

        const dueSoon = await db()
            .select({ id: tasks.id, dueDate: tasks.dueDate })
            .from(tasks)
            .where(
                and(
                    isNull(tasks.deletedAt),
                    inArray(tasks.status, ['pending', 'in_progress']),
                    isNotNull(tasks.dueDate),
                    sql`${tasks.dueDate} >= ${day}`,
                    sql`${tasks.dueDate} <= ${addDays(day, window)}`,
                    isNotNull(tasks.assigneeId),
                    liveProject,
                ),
            )
            .orderBy(tasks.id);

        let sent = 0;
        for (const task of dueSoon) {
            const already = await db()
                .select({ id: notifications.id })
                .from(notifications)
                .where(
                    and(
                        eq(notifications.type, 'deadline_approaching'),
                        eq(notifications.subjectType, 'task'),
                        eq(notifications.subjectId, task.id),
                        sql`${notifications.data}->>'due_date' = ${task.dueDate}`,
                    ),
                )
                .limit(1);
            if (already.length) continue;

            await Notify.deadlineApproaching(await loadTaskInfo(task.id), dueLabel(task.dueDate, day) ?? 'due soon');
            sent++;
        }
        return sent;
    },
};

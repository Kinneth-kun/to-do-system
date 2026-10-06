import { and, avg, count, eq, inArray, isNull, lt, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import { addDays, diffInDays, formatDate, now, today } from '../dates';
import { ProjectStatus, TaskStatus, type ProjectHealth } from '../enums';
import { Settings } from '../settings';
import { isProjectOverdue } from '../task-utils';

/*
 * Project progress and health. Thresholds are configurable in Settings ("Project health").
 *
 * Rules, evaluated in order:
 *  1. Project status Completed                          → Completed
 *  2. Project status On Hold or Cancelled               → On Hold
 *  3. Has tasks and every non-cancelled task completed  → Completed
 *  4. Project past its due date (if enabled)            → Delayed
 *  5. Delayed share of open tasks ≥ delayed threshold   → Delayed
 *  6. Delayed share of open tasks ≥ at-risk threshold   → At Risk
 *  7. Behind expected (time-based) progress by ≥ gap    → At Risk
 *  8. Inside due-soon window with low progress          → At Risk
 *  9. Otherwise                                         → On Track
 */

const { projects, tasks } = schema;

export type ProjectRow = typeof projects.$inferSelect;

export type HealthStats = {
    total: number;
    open: number;
    completed: number;
    delayed: number;
    delayed_percent: number;
    progress: number;
    expected_progress: number;
};

export type HealthEvaluation = { health: ProjectHealth; reasons: string[]; stats: HealthStats };

/** Task counts keyed by status, plus `total` (live tasks). */
export async function taskCounts(projectId: number): Promise<Record<TaskStatus | 'total', number>> {
    const rows = await db()
        .select({ status: tasks.status, c: count() })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
        .groupBy(tasks.status);
    const result = Object.fromEntries(TaskStatus.values.map((s) => [s, 0])) as Record<TaskStatus | 'total', number>;
    for (const row of rows) if (TaskStatus.is(row.status)) result[row.status] = Number(row.c);
    result.total = TaskStatus.values.reduce((sum, s) => sum + result[s], 0);
    return result;
}

export const ProjectHealthService = {
    /** Recalculate and persist the cached progress + health. */
    async refresh(projectId: number): Promise<ProjectRow | null> {
        const [project] = await db().select().from(projects).where(eq(projects.id, projectId)).limit(1);
        if (!project) return null;

        const progress = await ProjectHealthService.calculateProgress(project.id);
        const { health } = await ProjectHealthService.evaluate({ ...project, progress });

        if (progress !== project.progress || health !== project.health) {
            await db().update(projects).set({ progress, health, updatedAt: now() }).where(eq(projects.id, project.id));
        }
        return { ...project, progress, health };
    },

    /** Average progress of the project's non-cancelled tasks. */
    async calculateProgress(projectId: number): Promise<number> {
        const [row] = await db()
            .select({ value: avg(tasks.progress) })
            .from(tasks)
            .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt), ne(tasks.status, 'cancelled')));
        return Math.round(Number(row?.value ?? 0));
    },

    async evaluate(project: Pick<ProjectRow, 'id' | 'status' | 'startDate' | 'dueDate' | 'progress'>): Promise<HealthEvaluation> {
        const s = await Settings.all();
        const counts = await taskCounts(project.id);
        const day = today();

        const nonCancelled = counts.total - counts.cancelled;
        const open = counts.pending + counts.in_progress + counts.delayed;
        const [{ c: overdueNotFlagged }] = await db()
            .select({ c: count() })
            .from(tasks)
            .where(
                and(
                    eq(tasks.projectId, project.id),
                    isNull(tasks.deletedAt),
                    inArray(tasks.status, ['pending', 'in_progress']),
                    lt(tasks.dueDate, day),
                ),
            );
        const delayed = counts.delayed + Number(overdueNotFlagged);
        const delayedPct = open > 0 ? Math.round((delayed / open) * 1000) / 10 : 0;
        const progress = project.progress ?? (await ProjectHealthService.calculateProgress(project.id));

        let expected: number | null = null;
        if (project.startDate && project.dueDate && project.dueDate > project.startDate) {
            const total = diffInDays(project.startDate, project.dueDate);
            const elapsed = diffInDays(project.startDate, day);
            expected = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
        }

        const stats: HealthStats = {
            total: counts.total,
            open,
            completed: counts.completed,
            delayed,
            delayed_percent: delayedPct,
            progress,
            expected_progress: expected ?? -1,
        };
        const result = (health: ProjectHealth, reasons: string[]): HealthEvaluation => ({ health, reasons, stats });

        if (project.status === 'completed') return result('completed', ['Project is marked completed.']);
        if (project.status === 'on_hold' || project.status === 'cancelled') {
            return result('on_hold', [`Project is ${ProjectStatus.label(project.status)}.`]);
        }
        if (nonCancelled > 0 && counts.completed === nonCancelled) return result('completed', ['All tasks are completed.']);

        const reasons: string[] = [];

        if (s['health.overdue_project_is_delayed'] && isProjectOverdue(project, day)) {
            return result('delayed', [`Project is past its due date (${formatDate(project.dueDate, 'M j, Y')}).`]);
        }

        if (delayed > 0 && delayedPct >= s['health.delayed_delayed_percent']) {
            return result('delayed', [`${delayed} of ${open} open tasks are delayed (${delayedPct}%).`]);
        }

        if (delayed > 0 && delayedPct >= s['health.at_risk_delayed_percent']) {
            reasons.push(`${delayed} of ${open} open tasks are delayed (${delayedPct}%).`);
        }

        if (expected !== null && expected - progress >= s['health.progress_gap_percent']) {
            reasons.push(`Progress is ${progress}% but ${expected}% of the schedule has elapsed.`);
        }

        if (
            project.dueDate &&
            project.dueDate >= day &&
            project.dueDate <= addDays(day, s['deadline.due_soon_days']) &&
            progress < s['health.due_soon_progress_percent']
        ) {
            reasons.push(`Due ${formatDate(project.dueDate, 'M j')} with only ${progress}% progress.`);
        }

        if (reasons.length) return result('at_risk', reasons);

        return result('on_track', ['No delayed tasks and progress is on schedule.']);
    },

    /** Recalculate every live project (the scheduled check, and after settings change). */
    async refreshAll(): Promise<number> {
        const rows = await db().select({ id: projects.id }).from(projects).where(isNull(projects.deletedAt)).orderBy(projects.id);
        for (const row of rows) await ProjectHealthService.refresh(row.id);
        return rows.length;
    },
};


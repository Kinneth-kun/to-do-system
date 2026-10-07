import { isOpenStatus, type TaskStatus } from './enums';
import { addDays, diffInDays } from './dates';

/*
 * Pure task date helpers (Task::isOverdue / isDueSoon / dueLabel). They take "today" explicitly
 * because only the server knows the application's timezone.
 */

type DueTask = { dueDate: string | null; status: TaskStatus | string };

export function isOverdue(task: DueTask, today: string): boolean {
    return task.dueDate !== null && task.dueDate < today && isOpenStatus(task.status as TaskStatus);
}

export function isDueSoon(task: DueTask, today: string, dueSoonDays: number): boolean {
    if (task.dueDate === null || !isOpenStatus(task.status as TaskStatus) || task.status === 'delayed') return false;
    return task.dueDate >= today && task.dueDate <= addDays(today, dueSoonDays);
}

/** "Due in 3 days" / "2 days overdue" / "Due today". */
export function dueLabel(dueDate: string | null, today: string): string | null {
    if (dueDate === null) return null;
    const diff = diffInDays(today, dueDate);
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    if (diff > 1) return `Due in ${diff} days`;
    if (diff === -1) return '1 day overdue';
    return `${Math.abs(diff)} days overdue`;
}

export type DueState = 'none' | 'closed' | 'overdue' | 'soon' | 'normal';

/** Drives the colour of due dates in lists (the <x-due-date> component). */
export function dueState(task: DueTask, today: string, dueSoonDays: number): DueState {
    if (task.dueDate === null) return 'none';
    if (!isOpenStatus(task.status as TaskStatus)) return 'closed';
    if (isOverdue(task, today) || task.status === 'delayed') return 'overdue';
    if (isDueSoon(task, today, dueSoonDays)) return 'soon';
    return 'normal';
}

export function isProjectOverdue(project: { dueDate: string | null; status: string }, today: string): boolean {
    return project.dueDate !== null && project.dueDate < today && project.status !== 'completed' && project.status !== 'cancelled';
}

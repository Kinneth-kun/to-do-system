'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { TaskStatus, taskStatusColor } from '@/lib/enums';
import type { TaskRowData } from '@/lib/views';
import { Icon } from '../icon';
import { Avatar, CategoryBadge, DepartmentBadge, DueDate, PriorityBadge, ProgressBar, StandaloneBadge, StatusBadge } from '../ui';
import { QuickUpdate } from './quick-update';

/** One task in a list, with an inline quick update. Wrap lists in `card divide-y divide-slate-100`. */
export function TaskRow({
    task,
    showProject = true,
    showAssignee = true,
    showRemark = true,
    quickUpdate = true,
}: {
    task: TaskRowData;
    showProject?: boolean;
    showAssignee?: boolean;
    showRemark?: boolean;
    quickUpdate?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const canUpdate = quickUpdate && task.canUpdate;
    const c = taskStatusColor(task.status);

    return (
        // Columns appear by the row's own width (container queries), not the viewport's, so a row
        // in a narrow panel keeps its title instead of squeezing it to nothing.
        <div className="group @container/row">
            <div className="flex items-start gap-3 px-4 py-3 @lg/row:items-center">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-${c}-500 @lg/row:mt-0`} title={TaskStatus.label(task.status)} />

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                            href={`/tasks/${task.id}`}
                            className={`truncate text-sm font-medium hover:text-indigo-600 ${task.status === 'completed' ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}
                        >
                            {task.title}
                        </Link>
                        <CategoryBadge category={task.category} />
                        {(task.priority === 'high' || task.priority === 'urgent') && <PriorityBadge priority={task.priority} />}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {showProject &&
                            (task.project ? (
                                <Link href={`/projects/${task.project.id}`} className="inline-flex max-w-[14rem] items-center gap-1.5 truncate hover:text-slate-700">
                                    <span className={`h-2 w-2 shrink-0 rounded-sm bg-${task.project.color}-500`} />
                                    {task.project.name}
                                </Link>
                            ) : (
                                task.standalone && <StandaloneBadge />
                            ))}
                        <DueDate text={task.due.text} state={task.due.state} title={task.due.title} />
                        <span className="@lg/row:hidden">
                            <StatusBadge status={task.status} size="sm" />
                        </span>
                    </div>
                    {showRemark && task.latestRemark && <p className="mt-1 line-clamp-1 text-xs text-slate-500 italic">“{task.latestRemark}”</p>}
                </div>

                <div className="hidden w-28 shrink-0 @2xl/row:block">
                    <ProgressBar value={task.progress} size="sm" showLabel />
                </div>
                <span className="hidden shrink-0 @lg/row:block">
                    <StatusBadge status={task.status} />
                </span>
                {showAssignee && (
                    <span className="hidden shrink-0 items-center gap-1.5 @md/row:flex">
                        <Avatar user={task.assignee} size="sm" />
                        {task.assignee?.department && <DepartmentBadge department={task.assignee.department} size="sm" short className="hidden @3xl/row:inline-flex" />}
                    </span>
                )}
                {canUpdate && (
                    <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Quick update">
                        <Icon name="pencil" className="h-4 w-4" />
                        <span className="hidden @3xl/row:inline">Update</span>
                    </button>
                )}
            </div>
            {canUpdate && open && (
                <div className="animate-fade-in border-t border-dashed border-slate-200 bg-slate-50/70 px-4 py-4">
                    <QuickUpdate taskId={task.id} status={task.status} progress={task.progress} compact onDone={close}>
                        <button type="button" className="btn-ghost btn-sm" onClick={close}>
                            Cancel
                        </button>
                    </QuickUpdate>
                </div>
            )}
        </div>
    );
}

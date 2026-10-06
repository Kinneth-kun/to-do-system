'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Department, Priority, TaskCategory } from '@/lib/enums';
import type { FormState } from '@/lib/validation';
import { ActionForm, Input, Select, SubmitButton, Textarea, useFieldError, useOld } from '../client/form';
import { Icon } from '../icon';
import { ProjectPicker, type ProjectOption } from '../shell/project-picker';
import { DueDatePresets, TaskKindToggle, type TaskKind } from './task-kind';

export type AssigneeOption = { id: number; name: string; jobTitle?: string | null; department?: string | null };

/** "Jane Cruz — IT Developer Associate" (or the department), with "(you)" on your own name. */
function assigneeLabel(u: AssigneeOption, currentUserId: number): string {
    const position = u.jobTitle?.trim() || (Department.is(u.department) ? Department.label(u.department) : '');
    const name = u.id === currentUserId ? `${u.name} (you)` : u.name;
    return position ? `${name} — ${position}` : name;
}

type TaskDefaults = {
    title?: string;
    description?: string | null;
    /** Post-launch type, when editing one. */
    category?: string | null;
    priority?: string;
    assigneeId?: number | null;
    startDate?: string | null;
    dueDate?: string | null;
};

function ProjectField({ projects, selected, onChange }: { projects: ProjectOption[]; selected: string; onChange: (projectId: string) => void }) {
    const error = useFieldError('project_id');
    return (
        <div className="mb-5">
            <label htmlFor="project_id" className="form-label">
                Project <span className="text-red-500">*</span>
            </label>
            <ProjectPicker projects={projects} selected={selected || null} onChange={onChange} error={error} />
            <p className="form-help">Need a new one? Create it here without losing what you&apos;ve typed.</p>
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

type CreateOptions = {
    projects: ProjectOption[];
    projectId: number | null;
    kind: TaskKind;
};

export function TaskForm({
    action,
    defaults = {},
    cancelHref,
    submitLabel,
    create,
    standalone = false,
    today,
    assignees,
    currentUserId,
}: {
    action: (state: FormState, formData: FormData) => Promise<FormState>;
    defaults?: TaskDefaults;
    cancelHref: string;
    submitLabel: string;
    create?: CreateOptions;
    /** Editing a standalone task. */
    standalone?: boolean;
    /** Today in the app's timezone; enables the due-date shortcuts on standalone tasks. */
    today?: string;
    /** Who the task can be assigned to; defaults to the current user. */
    assignees: AssigneeOption[];
    currentUserId: number;
}) {
    const oldKind = useOld('kind', create?.kind ?? 'project');
    const [kind, setKind] = useState<TaskKind>(oldKind === 'standalone' ? 'standalone' : 'project');
    const isStandalone = create ? kind === 'standalone' : standalone;

    // A task added to a completed project is post-launch work: it gets a type instead of
    // counting toward the finished project's progress.
    const oldProject = useOld('project_id', create?.projectId ? String(create.projectId) : '') as string;
    const [projectId, setProjectId] = useState(oldProject);
    const onProjectChange = useCallback((value: string) => setProjectId(value), []);
    const postLaunch = create ? kind === 'project' && !!create.projects.find((p) => String(p.id) === projectId)?.completed : !!defaults.category;

    return (
        <ActionForm action={action} className="card">
            <div className="card-body">
                {create && (
                    <>
                        <TaskKindToggle value={kind} onChange={setKind} />
                        {kind === 'project' && <ProjectField projects={create.projects} selected={projectId} onChange={onProjectChange} />}
                    </>
                )}
                {postLaunch && (
                    <div className="mb-5 grid gap-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-end">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
                                <Icon name="sparkles" className="h-5 w-5" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Post-launch work</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                                    This project is completed, so this is logged under Enhancements &amp; updates. It won&apos;t change the project&apos;s progress.
                                </p>
                            </div>
                        </div>
                        <Select name="category" label="Type" options={TaskCategory.options()} defaultValue={defaults.category ?? 'enhancement'} required />
                    </div>
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                    <Input name="title" label="Title" defaultValue={defaults.title} required maxLength={255} wrapperClassName="sm:col-span-2" />
                    <Textarea name="description" label="Description" defaultValue={defaults.description ?? ''} rows={5} wrapperClassName="sm:col-span-2" />
                    <Select
                        name="assignee_id"
                        label="Assigned to"
                        options={assignees.map((u) => ({ value: u.id, label: assigneeLabel(u, currentUserId) }))}
                        defaultValue={defaults.assigneeId ?? currentUserId}
                        required
                        help="Defaults to you. Anyone else is notified and can update the task."
                    />
                    <Select name="priority" label="Priority" options={Priority.options()} defaultValue={defaults.priority ?? 'medium'} required />
                    <Input name="start_date" label="Start date" type="date" defaultValue={defaults.startDate ?? ''} />
                    <div>
                        <Input name="due_date" label="Due date" type="date" defaultValue={defaults.dueDate ?? ''} help="Overdue tasks are marked Delayed automatically." />
                        {isStandalone && today && <DueDatePresets inputId="due_date" today={today} />}
                    </div>
                </div>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <Link href={cancelHref} className="btn-secondary">
                        Cancel
                    </Link>
                    <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
                </div>
            </div>
        </ActionForm>
    );
}

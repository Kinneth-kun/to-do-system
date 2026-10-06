'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Priority } from '@/lib/enums';
import type { FormState } from '@/lib/validation';
import { ActionForm, Input, Select, SubmitButton, Textarea, useFieldError, useOld } from '../client/form';
import { ProjectPicker, type ProjectOption } from '../shell/project-picker';
import { DueDatePresets, TaskKindToggle, type TaskKind } from './task-kind';

type TaskDefaults = {
    title?: string;
    description?: string | null;
    priority?: string;
    startDate?: string | null;
    dueDate?: string | null;
};

function ProjectField({ projects, projectId }: { projects: ProjectOption[]; projectId: number | null }) {
    const selected = useOld('project_id', projectId ? String(projectId) : '') as string;
    const error = useFieldError('project_id');
    return (
        <div className="mb-5">
            <label htmlFor="project_id" className="form-label">
                Project <span className="text-red-500">*</span>
            </label>
            <ProjectPicker projects={projects} selected={selected || null} error={error} />
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
}) {
    const oldKind = useOld('kind', create?.kind ?? 'project');
    const [kind, setKind] = useState<TaskKind>(oldKind === 'standalone' ? 'standalone' : 'project');
    const isStandalone = create ? kind === 'standalone' : standalone;

    return (
        <ActionForm action={action} className="card">
            <div className="card-body">
                {create && (
                    <>
                        <TaskKindToggle value={kind} onChange={setKind} />
                        {kind === 'project' && <ProjectField projects={create.projects} projectId={create.projectId} />}
                    </>
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                    <Input name="title" label="Title" defaultValue={defaults.title} required maxLength={255} wrapperClassName="sm:col-span-2" />
                    <Textarea name="description" label="Description" defaultValue={defaults.description ?? ''} rows={5} wrapperClassName="sm:col-span-2" />
                    {/* No assignee field: a task belongs to the person who creates it. */}
                    <div className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
                        <Select name="priority" label="Priority" options={Priority.options()} defaultValue={defaults.priority ?? 'medium'} required />
                        <Input name="start_date" label="Start date" type="date" defaultValue={defaults.startDate ?? ''} />
                        <div>
                            <Input name="due_date" label="Due date" type="date" defaultValue={defaults.dueDate ?? ''} help="Overdue tasks are marked Delayed automatically." />
                            {isStandalone && today && <DueDatePresets inputId="due_date" today={today} />}
                        </div>
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

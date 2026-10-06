'use client';

import Link from 'next/link';
import { useState } from 'react';
import { quickCreateAction } from '@/app/actions/tasks';
import { Priority } from '@/lib/enums';
import { Icon } from '../icon';
import { ActionForm, Input, Select, SubmitButton, useFieldError, useOld } from '../client/form';
import { closeModal, Modal } from '../client/modal';
import { DueDatePresets, TaskKindToggle, type TaskKind } from '../tasks/task-kind';
import { ProjectPicker, useCurrentProject, type ProjectOption } from './project-picker';

function ProjectField({ projects }: { projects: ProjectOption[] }) {
    const current = useCurrentProject();
    const error = useFieldError('project_id');
    return (
        <div>
            <label htmlFor="quick-project" className="form-label">
                Project <span className="text-red-500">*</span>
            </label>
            <ProjectPicker id="quick-project" projects={projects} selected={current} error={error} compactButton />
            {!projects.length && <p className="form-help">You don&apos;t have a project yet — create one with the + button.</p>}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

function QuickCreateFields({ projects, today }: { projects: ProjectOption[]; today: string }) {
    const oldKind = useOld('kind', null);
    // Without a project to pick, a quick task is standalone until the person says otherwise.
    const [chosen, setChosen] = useState<TaskKind | null>(null);
    const kind: TaskKind = chosen ?? (oldKind === 'standalone' || oldKind === 'project' ? oldKind : projects.length ? 'project' : 'standalone');

    return (
        <>
            <Input id="quick-title" name="title" label="Task title" required maxLength={255} placeholder="What needs to be done?" />
            <TaskKindToggle value={kind} onChange={setChosen} compact />
            {kind === 'project' ? <ProjectField projects={projects} /> : <p className="-mt-1 text-xs text-slate-500">A one-off with no project — perfect for work you&apos;ll finish in a day or a week.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <Input id="quick-due" name="due_date" label="Due date" type="date" />
                    {kind === 'standalone' && <DueDatePresets inputId="quick-due" today={today} />}
                </div>
                <Select id="quick-priority" name="priority" label="Priority" options={Priority.options()} defaultValue="medium" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <Link href={kind === 'standalone' ? '/tasks/new?kind=standalone' : '/tasks/new'} className="btn-ghost btn-sm mr-auto" onClick={() => closeModal('quick-create')}>
                    More options
                </Link>
                <button type="button" className="btn-secondary" onClick={() => closeModal('quick-create')}>
                    Cancel
                </button>
                <SubmitButton pendingText="Creating…">
                    <Icon name="plus" className="h-4 w-4" stroke={2} /> Create task
                </SubmitButton>
            </div>
        </>
    );
}

/** Global quick create (press "n"). Minimal fields only — "More options" opens the full form. */
export function QuickCreateModal({ projects, today }: { projects: ProjectOption[]; today: string }) {
    return (
        <Modal name="quick-create" title="Quick create" maxWidth="lg">
            <ActionForm action={quickCreateAction} className="space-y-4 p-5">
                <QuickCreateFields projects={projects} today={today} />
            </ActionForm>
        </Modal>
    );
}

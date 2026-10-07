'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createProjectInlineAction, type InlineProjectState } from '@/app/actions/projects';
import { Icon } from '../icon';
import { closeModal, Modal } from '../client/modal';
import { toast } from '../client/toaster';
import { submitInTransition } from '../client/form';

/*
 * Create a project without leaving the page you are on (the task forms and quick create).
 * On success it announces the project with a `project-created` window event, which project
 * pickers listen for to add and select it in place.
 */
export function NewProjectModal() {
    const [state, action, pending] = useActionState<InlineProjectState, FormData>(createProjectInlineAction, null);
    const form = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!state?.project) return;
        window.dispatchEvent(new CustomEvent('project-created', { detail: state.project }));
        toast(`Project “${state.project.name}” created.`);
        form.current?.reset();
        closeModal('new-project');
    }, [state]);

    const errors = state?.errors ?? {};

    return (
        <Modal name="new-project" title="New project" maxWidth="lg">
            <form ref={form} onSubmit={(event) => submitInTransition(event, action)} className="space-y-4 p-5">
                <p className="text-sm text-slate-500">Every task belongs to a project. Create one here and it will be selected for you.</p>

                <div>
                    <label htmlFor="new-project-name" className="form-label">
                        Project name <span className="text-red-500">*</span>
                    </label>
                    <input id="new-project-name" name="name" type="text" className={`form-input ${errors.name ? 'border-red-400' : ''}`} required maxLength={255} placeholder="e.g. Tenant Move-In 2026" />
                    {errors.name && <p className="form-error">{errors.name}</p>}
                </div>

                <div>
                    <label htmlFor="new-project-description" className="form-label">
                        Description <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <textarea id="new-project-description" name="description" rows={2} className="form-input" maxLength={10000} placeholder="What is this project for?" />
                    {errors.description && <p className="form-error">{errors.description}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="new-project-start" className="form-label">
                            Start date
                        </label>
                        <input id="new-project-start" name="start_date" type="date" className="form-input" />
                        {errors.start_date && <p className="form-error">{errors.start_date}</p>}
                    </div>
                    <div>
                        <label htmlFor="new-project-due" className="form-label">
                            Due date
                        </label>
                        <input id="new-project-due" name="due_date" type="date" className="form-input" />
                        {errors.due_date && <p className="form-error">{errors.due_date}</p>}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                    <p className="mr-auto text-xs text-slate-400">You can set priority, colour and members later.</p>
                    <button type="button" className="btn-secondary" onClick={() => closeModal('new-project')} disabled={pending}>
                        Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={pending}>
                        <Icon name="plus" className="h-4 w-4" stroke={2} />
                        {pending ? 'Creating…' : 'Create project'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

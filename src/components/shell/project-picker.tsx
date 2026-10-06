'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '../icon';
import { openModal } from '../client/modal';

/*
 * A project <select> that can absorb a project created in the "New project" modal: the modal
 * announces it with a `project-created` window event, the picker adds and selects it, and the
 * half-filled task form around it is never lost.
 */

export type ProjectOption = { id: number; name: string };
export type CreatedProject = { id: number; name: string; color: string; url: string };

/* The project the current page is about — pre-selects it in quick create. */
let currentProject: number | null = null;
const listeners = new Set<() => void>();
export function setCurrentProject(id: number | null) {
    currentProject = id;
    listeners.forEach((l) => l());
}
export function useCurrentProject(): number | null {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => currentProject,
        () => null,
    );
}

/** Rendered by project and task pages so quick create defaults to their project. */
export function SetCurrentProject({ id }: { id: number }) {
    useEffect(() => {
        setCurrentProject(id);
        return () => setCurrentProject(null);
    }, [id]);
    return null;
}

export function ProjectPicker({
    projects,
    selected,
    id = 'project_id',
    name = 'project_id',
    onChange,
    error,
    compactButton = false,
}: {
    projects: ProjectOption[];
    selected: number | string | null;
    id?: string;
    name?: string;
    onChange?: (projectId: string) => void;
    error?: string;
    compactButton?: boolean;
}) {
    const [options, setOptions] = useState(projects);
    const [value, setValue] = useState(selected ? String(selected) : '');

    useEffect(() => setOptions(projects), [projects]);
    useEffect(() => setValue(selected ? String(selected) : ''), [selected]);

    useEffect(() => {
        const onCreated = (event: Event) => {
            const project = (event as CustomEvent<CreatedProject>).detail;
            setOptions((current) => (current.some((p) => p.id === project.id) ? current : [...current, { id: project.id, name: project.name }]));
            setValue(String(project.id));
            onChange?.(String(project.id));
        };
        window.addEventListener('project-created', onCreated);
        return () => window.removeEventListener('project-created', onCreated);
    }, [onChange]);

    return (
        <div className="flex gap-2">
            <select
                id={id}
                name={name}
                required
                value={value}
                onChange={(e) => {
                    setValue(e.target.value);
                    onChange?.(e.target.value);
                }}
                className={`form-select min-w-0 flex-1 ${error ? 'border-red-400' : ''}`}
            >
                <option value="">Choose a project</option>
                {options.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name}
                    </option>
                ))}
            </select>
            <button type="button" className="btn-secondary shrink-0 px-3" title="Create a new project" onClick={() => openModal('new-project')}>
                <Icon name="plus" className="h-4 w-4" stroke={2} />
                <span className={compactButton ? 'sr-only' : 'sr-only sm:not-sr-only sm:inline'}>New</span>
            </button>
        </div>
    );
}

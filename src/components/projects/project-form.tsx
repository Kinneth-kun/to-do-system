'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Department, Priority, PROJECT_COLORS, ProjectStatus } from '@/lib/enums';
import type { UserLite } from '@/lib/users';
import type { FormState } from '@/lib/validation';
import { Icon } from '../icon';
import { ActionForm, Input, Select, SubmitButton, Textarea, useFieldError, useOld } from '../client/form';
import { Avatar, DepartmentBadge } from '../ui';

/**
 * Deliberate member selection: a searchable list of real checkboxes. People join a project only
 * when somebody chooses them here or on the project's Team panel.
 */
function MemberPicker({ users, name = 'member_ids[]' }: { users: UserLite[]; name?: string }) {
    const old = useOld(name, []) as string[] | string;
    const initial = new Set((Array.isArray(old) ? old : [old]).map(Number));
    const [selected, setSelected] = useState(initial);
    const [query, setQuery] = useState('');
    const error = useFieldError(name);

    const term = query.trim().toLowerCase();
    const matches = (u: UserLite) =>
        !term || selected.has(u.id) || `${u.name} ${u.username} ${u.jobTitle ?? ''} ${u.department ? Department.label(u.department) : ''}`.toLowerCase().includes(term);
    const visible = users.filter(matches);

    return (
        <div>
            <div className="mb-1 flex items-end justify-between gap-3">
                <span className="form-label mb-0">Members</span>
                {selected.size > 0 && (
                    <span className="text-xs text-slate-500">
                        {selected.size} selected
                        <button type="button" className="ml-1 font-medium text-indigo-600 hover:underline" onClick={() => setSelected(new Set())}>
                            Clear
                        </button>
                    </span>
                )}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {users.length > 6 && (
                    <div className="relative border-b border-slate-100">
                        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            placeholder="Search people…"
                            aria-label="Search people"
                            className="w-full border-0 py-2.5 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                )}
                <div className="max-h-60 overflow-y-auto">
                    {users.map((u) => (
                        <label key={u.id} className={`cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50 ${matches(u) ? 'flex' : 'hidden'}`}>
                            <input
                                type="checkbox"
                                name={name}
                                value={u.id}
                                className="form-checkbox shrink-0"
                                checked={selected.has(u.id)}
                                onChange={(e) =>
                                    setSelected((current) => {
                                        const next = new Set(current);
                                        if (e.target.checked) next.add(u.id);
                                        else next.delete(u.id);
                                        return next;
                                    })
                                }
                            />
                            <Avatar user={u} size="sm" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-slate-800">{u.name}</span>
                                <span className="block truncate text-xs text-slate-500">
                                    {u.username}
                                    {u.jobTitle ? ` · ${u.jobTitle}` : ''}
                                </span>
                            </span>
                            {u.department && <DepartmentBadge department={u.department} size="sm" short className="shrink-0" />}
                        </label>
                    ))}
                    {!users.length && <p className="px-3 py-6 text-center text-sm text-slate-500">No other people to add yet.</p>}
                    {users.length > 0 && !visible.length && <p className="px-3 py-6 text-center text-sm text-slate-500">No one matches “{query}”.</p>}
                </div>
            </div>
            <p className="form-help">Optional — choose who should have access to this project. You can add or remove people at any time.</p>
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

type ProjectDefaults = {
    name: string;
    description: string | null;
    status: string;
    priority: string;
    color: string;
    startDate: string | null;
    dueDate: string | null;
    ownerId: number;
};

export function ProjectForm({
    action,
    users,
    project,
    canTransfer = false,
}: {
    action: (state: FormState, formData: FormData) => Promise<FormState>;
    users: UserLite[];
    project?: ProjectDefaults & { id: number };
    canTransfer?: boolean;
}) {
    return (
        <ActionForm action={action} className="card">
            <div className="card-body">
                <div className="grid gap-5 sm:grid-cols-2">
                    <Input name="name" label="Project name" defaultValue={project?.name} required maxLength={255} wrapperClassName="sm:col-span-2" />
                    <Textarea name="description" label="Description" defaultValue={project?.description ?? ''} rows={4} wrapperClassName="sm:col-span-2" />
                    {project && <Select name="status" label="Status" options={ProjectStatus.options()} defaultValue={project.status} required />}
                    <Select name="priority" label="Priority" options={Priority.options()} defaultValue={project?.priority ?? 'medium'} required />
                    <Input name="start_date" label="Start date" type="date" defaultValue={project?.startDate ?? ''} />
                    <Input name="due_date" label="Due date" type="date" defaultValue={project?.dueDate ?? ''} help="Must be on or after the start date." />
                    <Select name="color" label="Colour" options={PROJECT_COLORS.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} defaultValue={project?.color ?? 'indigo'} required />
                    {!project && (
                        <div className="sm:col-span-2">
                            <MemberPicker users={users} />
                        </div>
                    )}
                    {project && canTransfer && <Select name="owner_id" label="Owner" options={users.map((u) => ({ value: u.id, label: u.name }))} defaultValue={project.ownerId} required />}
                </div>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <Link href={project ? `/projects/${project.id}` : '/projects'} className="btn-secondary">
                        Cancel
                    </Link>
                    <SubmitButton pendingText="Saving…">{project ? 'Save changes' : 'Create project'}</SubmitButton>
                </div>
            </div>
        </ActionForm>
    );
}

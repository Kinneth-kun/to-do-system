'use client';

import { useState } from 'react';
import { Department, ROLE_ADMIN } from '@/lib/enums';
import type { FormState } from '@/lib/validation';
import { Icon } from '../icon';
import { ActionForm, FormError, Input, Select, SubmitButton, useOld } from '../client/form';

type UserDefaults = { name: string; username: string; email: string; roleId: number; jobTitle: string | null; department: string | null };

type RoleOption = { id: number; name: string; label: string };

/** Role, then job title and department — which administrators don't have. */
function RoleFields({ roles, user }: { roles: RoleOption[]; user?: UserDefaults }) {
    const initial = useOld('role_id', String(user?.roleId ?? roles.find((r) => r.name === 'user')?.id ?? '')) as string;
    const [roleId, setRoleId] = useState(initial);
    const isAdmin = roles.find((r) => String(r.id) === roleId)?.name === ROLE_ADMIN;
    return (
        <>
            <Select name="role_id" label="Role" options={roles.map((r) => ({ value: r.id, label: r.label }))} defaultValue={initial} onChange={(e) => setRoleId(e.target.value)} required />
            {isAdmin ? (
                <p className="flex items-start gap-2 self-end rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500 sm:col-span-2">
                    <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    Administrators don&apos;t belong to a department and have no job title.
                </p>
            ) : (
                <>
                    <Input name="job_title" label="Job title" defaultValue={user?.jobTitle ?? ''} />
                    <Select name="department" label="Department" options={Department.options()} defaultValue={user?.department ?? ''} placeholder="Select a department" required help="Used to identify this person's tasks." />
                </>
            )}
        </>
    );
}

export function UserForm({ action, roles, user }: { action: (state: FormState, formData: FormData) => Promise<FormState>; roles: RoleOption[]; user?: UserDefaults }) {
    return (
        <ActionForm action={action} className="card">
            <div className="card-body space-y-5">
                <FormError />
                <div className="grid gap-5 sm:grid-cols-2">
                    <Input name="name" label="Full name" defaultValue={user?.name} required autoComplete="name" />
                    <Input name="username" label="Username" defaultValue={user?.username} required autoComplete="username" />
                    <Input name="email" type="email" label="Email address" defaultValue={user?.email} required autoComplete="email" />
                    <RoleFields roles={roles} user={user} />
                </div>
                {!user && (
                    <div className="grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
                        <Input name="password" type="password" label="Temporary password" required autoComplete="new-password" help="At least 8 characters, with letters and numbers." />
                        <Input name="password_confirmation" type="password" label="Confirm password" required autoComplete="new-password" />
                    </div>
                )}
                <div className="flex justify-end border-t border-slate-100 pt-5">
                    <SubmitButton pendingText="Saving…">
                        <Icon name="check" className="h-4 w-4" /> {user ? 'Save changes' : 'Create user'}
                    </SubmitButton>
                </div>
            </div>
        </ActionForm>
    );
}

export function ResetPasswordForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
    return (
        <ActionForm action={action} resetOnSuccess className="card-body space-y-5">
            <Input name="password" type="password" label="New password" required autoComplete="new-password" />
            <Input name="password_confirmation" type="password" label="Confirm new password" required autoComplete="new-password" />
            <SubmitButton className="btn-secondary w-full justify-center" pendingText="Saving…">
                <Icon name="key" className="h-4 w-4" /> Reset password
            </SubmitButton>
        </ActionForm>
    );
}

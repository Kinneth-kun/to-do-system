'use client';

import { addMemberAction, changeMemberRoleAction, removeMemberAction } from '@/app/actions/projects';
import { Icon } from '../icon';
import { ConfirmForm } from '../client/confirm';
import { ActionForm, SubmitButton, useFieldError } from '../client/form';

function CandidateSelect({ candidates }: { candidates: { id: number; name: string }[] }) {
    const error = useFieldError('user_id');
    return (
        <div className="min-w-0 flex-1">
            <select name="user_id" className={`form-select text-sm ${error ? 'border-red-400' : ''}`} required defaultValue="" aria-label="Add a team member">
                <option value="">Add someone…</option>
                {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name}
                    </option>
                ))}
            </select>
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

export function AddMemberForm({ projectId, candidates }: { projectId: number; candidates: { id: number; name: string }[] }) {
    return (
        <ActionForm action={addMemberAction.bind(null, projectId)} resetOnSuccess className="flex gap-2">
            <CandidateSelect candidates={candidates} />
            <select name="role" className="form-select w-28 shrink-0 text-sm" defaultValue="member" aria-label="Role">
                <option value="member">Member</option>
                <option value="manager">Manager</option>
            </select>
            <SubmitButton className="btn-secondary btn-sm shrink-0">Add</SubmitButton>
        </ActionForm>
    );
}

/** Role switch and removal for one member (managers only; never shown for the owner). */
export function MemberControls({ projectId, userId, name, role }: { projectId: number; userId: number; name: string; role: string }) {
    return (
        <div className="flex shrink-0 items-center gap-1">
            <form action={changeMemberRoleAction.bind(null, projectId, userId)}>
                <select
                    name="role"
                    defaultValue={role}
                    className="rounded-md border border-slate-200 bg-white py-1 pr-6 pl-2 text-xs text-slate-600 hover:border-slate-300"
                    aria-label={`Role for ${name}`}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                </select>
            </form>
            <ConfirmForm
                action={removeMemberAction.bind(null, projectId, userId)}
                title={`Remove ${name}`}
                message="They lose access to this project, apart from tasks they are assigned to or collaborate on."
                confirm="Remove"
            >
                <button type="submit" className="btn-icon h-7 w-7 text-slate-400 hover:text-red-600" aria-label={`Remove ${name}`}>
                    <Icon name="x" className="h-4 w-4" />
                </button>
            </ConfirmForm>
        </div>
    );
}

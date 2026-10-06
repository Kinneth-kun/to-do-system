import type { Metadata } from 'next';
import { updatePasswordAction } from '@/app/actions/profile';
import { requireUser } from '@/lib/auth/session';
import { Department } from '@/lib/enums';
import { Icon } from '@/components/icon';
import { ActionForm, Input, SubmitButton } from '@/components/client/form';
import { Avatar, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'My profile' };

export default async function ProfilePage() {
    const user = await requireUser();

    // Read-only: account details are managed by administrators (Administration → Users).
    const details: [string, string][] = [
        ['Full name', user.name],
        ['Username', user.username],
        ['Email address', user.email],
        // Administrators have no job title or department.
        ...(user.isAdmin
            ? []
            : ([
                  ['Job title', user.jobTitle || '—'],
                  ['Department', Department.is(user.department) ? Department.label(user.department) : '—'],
              ] as [string, string][])),
        ['Role', user.isAdmin ? 'Administrator' : user.role === 'executive' ? 'Executive' : 'User'],
    ];

    return (
        <>
            <PageHeader title="My profile" description="Your account details and password." />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
                <section className="card h-fit">
                    <div className="card-header justify-start gap-4">
                        <Avatar user={user} size="lg" />
                        <div>
                            <h2 className="card-title">Profile details</h2>
                            <p className="mt-1 text-sm text-slate-500">Visible to your teammates. Need a change? Ask an administrator.</p>
                        </div>
                    </div>
                    <dl className="divide-y divide-slate-100 text-sm">
                        {details.map(([label, value]) => (
                            <div key={label} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                <dt className="text-slate-500">{label}</dt>
                                <dd className="font-medium break-all text-slate-800 sm:text-right">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <section className="card h-fit">
                    <div className="card-header block">
                        <h2 className="card-title">Change password</h2>
                        <p className="mt-1 text-sm text-slate-500">Use a password you do not use elsewhere.</p>
                    </div>
                    <ActionForm action={updatePasswordAction} resetOnSuccess className="card-body space-y-5">
                        <Input name="current_password" type="password" label="Current password" required autoComplete="current-password" />
                        <Input name="password" type="password" label="New password" required autoComplete="new-password" help="At least 8 characters, with letters and numbers." />
                        <Input name="password_confirmation" type="password" label="Confirm new password" required autoComplete="new-password" />
                        <SubmitButton className="btn-secondary w-full justify-center" pendingText="Saving…">
                            <Icon name="lock" className="h-4 w-4" /> Change password
                        </SubmitButton>
                    </ActionForm>
                </section>
            </div>
        </>
    );
}

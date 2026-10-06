import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { resetUserPasswordAction, updateUserAction } from '@/app/actions/admin';
import { requireAdmin } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { formatDate } from '@/lib/dates';
import { ResetPasswordForm, UserForm } from '@/components/admin/user-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Edit user' };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();
    const id = Number((await params).id);
    const [user] = Number.isInteger(id) ? await db().select().from(schema.users).where(eq(schema.users.id, id)) : [];
    if (!user) notFound();
    const roles = await db().select({ id: schema.roles.id, name: schema.roles.name, label: schema.roles.label }).from(schema.roles).orderBy(asc(schema.roles.label));

    return (
        <>
            <PageHeader
                title="Edit user"
                description={`Update access and account details for ${user.name}.`}
                back="/admin/users"
                meta={<p className="mt-2 text-xs text-slate-500">Created {formatDate(user.createdAt, 'M j, Y')}</p>}
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
                {/* Only the editable fields cross to the browser — never the whole row. */}
                <UserForm
                    action={updateUserAction.bind(null, id)}
                    roles={roles}
                    user={{
                        name: user.name,
                        username: user.username,
                        email: user.email,
                        roleId: user.roleId,
                        jobTitle: user.jobTitle,
                        department: user.department,
                    }}
                />

                <section className="card h-fit">
                    <div className="card-header block">
                        <h2 className="card-title">Reset password</h2>
                        <p className="mt-1 text-sm text-slate-500">This also clears any active login lock and signs them out everywhere.</p>
                    </div>
                    <ResetPasswordForm action={resetUserPasswordAction.bind(null, id)} />
                </section>
            </div>
        </>
    );
}

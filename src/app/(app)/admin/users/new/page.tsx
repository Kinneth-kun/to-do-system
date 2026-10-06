import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { createUserAction } from '@/app/actions/admin';
import { requireAdmin } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { UserForm } from '@/components/admin/user-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Add user' };

export default async function NewUserPage() {
    await requireAdmin();
    const roles = await db().select({ id: schema.roles.id, label: schema.roles.label }).from(schema.roles).orderBy(asc(schema.roles.label));

    return (
        <>
            <PageHeader title="Add user" description="Create an account and assign its access level." back="/admin/users" />
            <UserForm action={createUserAction} roles={roles} />
        </>
    );
}

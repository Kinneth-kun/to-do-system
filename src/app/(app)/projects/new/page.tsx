import type { Metadata } from 'next';
import { createProjectAction } from '@/app/actions/projects';
import { requireUser } from '@/lib/auth/session';
import { activeUsers } from '@/lib/users';
import { ProjectForm } from '@/components/projects/project-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'New Project' };

export default async function NewProjectPage() {
    const user = await requireUser();
    // You are added automatically, so the picker lists everyone else.
    const users = (await activeUsers()).filter((u) => u.id !== user.id);

    return (
        <>
            <PageHeader title="New project" description="Set up a workspace for related tasks." back="/projects" />
            <ProjectForm action={createProjectAction} users={users} />
        </>
    );
}

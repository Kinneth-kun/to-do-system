import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';
import { can, projectAccess } from '@/lib/access';
import { updateProjectAction } from '@/app/actions/projects';
import { requireUser } from '@/lib/auth/session';
import { findProject } from '@/lib/services/projects';
import { activeUsers, usersByIds } from '@/lib/users';
import { ProjectForm } from '@/components/projects/project-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Edit Project' };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const user = await requireUser();
    const id = Number((await params).id);
    const project = Number.isInteger(id) ? await findProject(id) : null;
    if (!project) notFound();
    const access = (await projectAccess(id))!;
    if (!can.updateProject(user, access)) forbidden();

    // A deactivated owner must still appear in the owner list, or saving would silently replace them.
    const users = await activeUsers();
    if (!users.some((u) => u.id === project.ownerId)) {
        const owner = (await usersByIds([project.ownerId])).get(project.ownerId);
        if (owner) users.unshift(owner);
    }

    return (
        <>
            <PageHeader title="Edit project" description="Keep the project details current." back={`/projects/${id}`} />
            <ProjectForm action={updateProjectAction.bind(null, id)} users={users} project={project} canTransfer={user.fullAccess || project.ownerId === user.id} />
        </>
    );
}

import type { Metadata } from 'next';
import { and, asc } from 'drizzle-orm';
import { projectAlive, projectVisibleTo } from '@/lib/access';
import { createTaskAction } from '@/app/actions/tasks';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { isValidDate, today } from '@/lib/dates';
import { TaskCategory } from '@/lib/enums';
import { param } from '@/lib/views';
import { assigneeOptions } from '@/lib/users';
import { TaskForm } from '@/components/tasks/task-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'New Task' };

const asId = (value: string | undefined) => (value && /^\d+$/.test(value) ? Number(value) : null);

/**
 * Pre-fills from ?project_id=&due_date=&kind=standalone&category= (project pages,
 * calendar, quick create). Without any projects to choose from, the form starts as standalone.
 */
export default async function NewTaskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const params = await searchParams;

    const projects = (
        await db()
            .select({ id: schema.projects.id, name: schema.projects.name, status: schema.projects.status })
            .from(schema.projects)
            .where(and(projectAlive, projectVisibleTo(user)))
            .orderBy(asc(schema.projects.name))
    ).map((p) => ({ id: p.id, name: p.name, completed: p.status === 'completed' }));

    let projectId = asId(param(params.project_id));
    if (projectId && !projects.some((p) => p.id === projectId)) projectId = null;

    const dueDate = param(params.due_date);
    const category = TaskCategory.is(param(params.category)) ? param(params.category)! : null;
    const kind = param(params.kind) === 'standalone' || (!projects.length && !projectId) ? 'standalone' : 'project';

    return (
        <>
            <PageHeader title="New task" description="Plan work inside a project, or add a quick standalone task." back="/tasks" />
            <TaskForm
                action={createTaskAction}
                defaults={{ dueDate: isValidDate(dueDate) ? dueDate : null, category }}
                cancelHref="/tasks"
                submitLabel="Create task"
                create={{ projects, projectId, kind }}
                today={today()}
                assignees={await assigneeOptions(user.id)}
                currentUserId={user.id}
            />
        </>
    );
}

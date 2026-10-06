import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { can, taskAccess } from '@/lib/access';
import { updateTaskAction } from '@/app/actions/tasks';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { today } from '@/lib/dates';
import { TaskForm } from '@/components/tasks/task-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Edit Task' };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
    const user = await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id)) notFound();
    const [task] = await db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, id), isNull(schema.tasks.deletedAt)));
    if (!task) notFound();
    if (!can.editTask(user, (await taskAccess(id))!)) forbidden();

    return (
        <>
            <PageHeader title="Edit task" description="Update the details without changing its history." back={`/tasks/${id}`} />
            <TaskForm
                action={updateTaskAction.bind(null, id)}
                defaults={{
                    title: task.title,
                    description: task.description,
                    priority: task.priority,
                    startDate: task.startDate,
                    dueDate: task.dueDate,
                }}
                cancelHref={`/tasks/${id}`}
                submitLabel="Save changes"
                standalone={task.projectId === null}
                today={today()}
            />
        </>
    );
}

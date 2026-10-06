import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';
import { and, count, eq, isNull } from 'drizzle-orm';
import { can, taskAccess } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { withQuery } from '@/lib/urls';
import { lastPage, loadHistory, paging } from '@/lib/views';
import { History } from '@/components/tasks/history';
import { EmptyState, PageHeader, Pagination, StatusBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Update history' };

const PER_PAGE = 25;

export default async function TaskUpdatesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id)) notFound();
    const [task] = await db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, id), isNull(schema.tasks.deletedAt)));
    if (!task) notFound();
    if (!can.viewTask(user, (await taskAccess(id))!)) forbidden();

    const { page, offset } = paging(await searchParams, PER_PAGE);
    const [{ total }] = await db().select({ total: count() }).from(schema.taskUpdates).where(eq(schema.taskUpdates.taskId, id));
    const updates = await loadHistory(id, PER_PAGE, offset);

    return (
        <>
            <PageHeader
                title="Update history"
                description={task.title}
                back={`/tasks/${id}`}
                meta={
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusBadge status={task.status} />
                        <span className="text-sm text-slate-500">{task.progress}% complete</span>
                        <span className="text-sm text-slate-400">· every change is kept permanently</span>
                    </div>
                }
            />
            <div className="card">
                <div className="card-body">
                    {updates.length ? <History updates={updates} detailed /> : <EmptyState icon="history" title="No updates yet" description="Status and progress changes will be recorded here." />}
                </div>
            </div>
            <div className="mt-6">
                <Pagination page={page} lastPage={lastPage(Number(total), PER_PAGE)} total={Number(total)} perPage={PER_PAGE} href={(p) => withQuery(`/tasks/${id}/updates`, { page: p })} />
            </div>
        </>
    );
}

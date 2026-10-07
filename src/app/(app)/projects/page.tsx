import type { Metadata } from 'next';
import Link from 'next/link';
import { and, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { can, loadProjectAccess, projectAlive, projectVisibleTo } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { diffForHumans, formatDate, today } from '@/lib/dates';
import { ProjectStatus } from '@/lib/enums';
import { contains } from '@/lib/search';
import { blobAccess, blobEnabled, humanSize } from '@/lib/storage';
import { isProjectOverdue } from '@/lib/task-utils';
import { withQuery } from '@/lib/urls';
import { userLiteColumns, usersByIds, type UserLite } from '@/lib/users';
import { lastPage, paging, param } from '@/lib/views';
import { Icon } from '@/components/icon';
import { SuggestionStrip, type SuggestionItem } from '@/components/projects/suggestions';
import { AvatarStack, cx, EmptyState, HealthBadge, PageHeader, Pagination, ProgressBar, ProjectStatusBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Projects' };

const PER_PAGE = 15;
/** Suggestions loaded per card (newest first); the card pages through them one at a time. */
const SUGGESTIONS_PER_CARD = 25;
const { projects } = schema;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    const params = await searchParams;
    const q = param(params.q)?.trim().slice(0, 100) || '';
    const status = ProjectStatus.is(param(params.status)) ? param(params.status)! : '';

    const where = and(projectAlive, projectVisibleTo(user), q ? contains(projects.name, q) : undefined, status ? eq(projects.status, status) : undefined);
    const { page, offset } = paging(params, PER_PAGE);
    const [{ total }] = await db().select({ total: count() }).from(projects).where(where);
    const rows = await db().select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(PER_PAGE).offset(offset);

    const ids = rows.map((p) => p.id);
    const members = new Map<number, UserLite[]>();
    const taskCounts = new Map<number, number>();
    // Open enhancements / bug fixes / updates on completed projects.
    const openPostLaunch = new Map<number, number>();
    const suggestions = new Map<number, SuggestionItem[]>();
    const suggestionTotals = new Map<number, number>();
    if (ids.length) {
        const memberRows = await db()
            .select({ projectId: schema.projectMembers.projectId, ...userLiteColumns })
            .from(schema.projectMembers)
            .innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
            .where(inArray(schema.projectMembers.projectId, ids))
            .orderBy(schema.projectMembers.createdAt);
        for (const { projectId, ...u } of memberRows) members.set(projectId, [...(members.get(projectId) ?? []), u as UserLite]);

        const countRows = await db()
            .select({ projectId: schema.tasks.projectId, c: count() })
            .from(schema.tasks)
            .where(and(inArray(schema.tasks.projectId, ids), isNull(schema.tasks.deletedAt), isNull(schema.tasks.category)))
            .groupBy(schema.tasks.projectId);
        for (const r of countRows) taskCounts.set(r.projectId!, Number(r.c));

        const postLaunchRows = await db()
            .select({ projectId: schema.tasks.projectId, c: count() })
            .from(schema.tasks)
            .where(
                and(
                    inArray(schema.tasks.projectId, ids),
                    isNull(schema.tasks.deletedAt),
                    isNotNull(schema.tasks.category),
                    inArray(schema.tasks.status, ['pending', 'in_progress', 'delayed', 'on_hold']),
                ),
            )
            .groupBy(schema.tasks.projectId);
        for (const r of postLaunchRows) openPostLaunch.set(r.projectId!, Number(r.c));

        // Recommendations and suggestions, newest first.
        const suggestionRows = await db()
            .select()
            .from(schema.projectSuggestions)
            .where(inArray(schema.projectSuggestions.projectId, ids))
            .orderBy(desc(schema.projectSuggestions.createdAt), desc(schema.projectSuggestions.id));
        const authors = await usersByIds(suggestionRows.map((r) => r.userId).filter((id): id is number => id !== null));
        // Reference files (images, documents) attached to those suggestions, oldest first.
        const fileRows = suggestionRows.length
            ? await db()
                  .select()
                  .from(schema.attachments)
                  .where(and(eq(schema.attachments.attachableType, 'project_suggestion'), inArray(schema.attachments.attachableId, suggestionRows.map((r) => r.id))))
                  .orderBy(schema.attachments.id)
            : [];
        const files = new Map<number, SuggestionItem['files']>();
        for (const f of fileRows) {
            files.set(f.attachableId, [
                ...(files.get(f.attachableId) ?? []),
                { id: f.id, name: f.originalName, size: humanSize(f.size), image: (f.mimeType ?? '').startsWith('image/') },
            ]);
        }
        const access = await loadProjectAccess(ids);
        for (const r of suggestionRows) {
            const list = suggestions.get(r.projectId) ?? [];
            suggestionTotals.set(r.projectId, (suggestionTotals.get(r.projectId) ?? 0) + 1);
            if (list.length >= SUGGESTIONS_PER_CARD) continue;
            const projectAccess = access.get(r.projectId);
            list.push({
                id: r.id,
                body: r.body,
                author: r.userId ? (authors.get(r.userId) ?? null) : null,
                when: diffForHumans(r.createdAt),
                whenTitle: formatDate(r.createdAt, 'M j, Y g:i A'),
                files: files.get(r.id) ?? [],
                canDelete: r.userId === user.id || (!!projectAccess && can.updateProject(user, projectAccess)),
            });
            suggestions.set(r.projectId, list);
        }
    }
    const day = today();

    return (
        <>
            <PageHeader title="Projects" description="Workspaces you own or collaborate on." />

            <form method="GET" className="toolbar mb-6">
                <div className="relative min-w-0 flex-1 sm:min-w-56 sm:max-w-xs">
                    <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    {/* Press Enter to search. */}
                    <input type="search" className="form-input pl-9" name="q" defaultValue={q} placeholder="Search projects" aria-label="Search projects" enterKeyHint="search" />
                    {status && <input type="hidden" name="status" value={status} />}
                </div>
                <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                    {[{ value: '', label: 'All' }, ...ProjectStatus.options()].map(({ value, label }) => (
                        <Link
                            key={value || 'all'}
                            href={withQuery('/projects', { q: q || null, status: value || null })}
                            className={cx(
                                'rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition',
                                status === value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                            )}
                        >
                            {label}
                        </Link>
                    ))}
                </div>
                <Link href="/projects/new" className="btn-primary sm:ml-auto">
                    <Icon name="plus" className="h-4 w-4" stroke={2} /> New project
                </Link>
            </form>

            {rows.length === 0 ? (
                <div className="card">
                    <EmptyState icon="folder" title="No projects found" description={q ? 'No projects match your search. Try different keywords.' : 'Create a project to give your work a home.'}>
                        <Link href="/projects/new" className="btn-primary">
                            Create project
                        </Link>
                    </EmptyState>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map((project) => {
                        const overdue = isProjectOverdue(project, day);
                        const taskCount = taskCounts.get(project.id) ?? 0;
                        const completed = project.status === 'completed';
                        const openItems = openPostLaunch.get(project.id) ?? 0;
                        return (
                            <div key={project.id} className="card card-hover group relative flex flex-col overflow-hidden">
                                <span className={`absolute inset-x-0 top-0 h-1 bg-${project.color}-500`} />
                                <Link href={`/projects/${project.id}`} className="block flex-1 p-5 pt-6">
                                    <div className="flex items-start justify-between gap-3">
                                        <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-slate-900 group-hover:text-indigo-600">{project.name}</h2>
                                        <HealthBadge health={project.health} size="sm" />
                                    </div>
                                    <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-slate-500">{project.description || 'No description yet.'}</p>

                                    {completed ? (
                                        <div className="mt-5 flex items-center gap-2 text-xs">
                                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                                <Icon name="check-circle" className="h-4 w-4" /> Completed
                                            </span>
                                            <span className="text-slate-300">·</span>
                                            <span className={cx('inline-flex items-center gap-1', openItems ? 'font-medium text-violet-700' : 'text-slate-500')}>
                                                <Icon name="sparkles" className="h-3.5 w-3.5" />
                                                {openItems ? `${openItems} open ${openItems === 1 ? 'enhancement' : 'enhancements'}` : 'No open enhancements'}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="mt-5 flex items-center gap-3">
                                            <ProgressBar value={project.progress} size="sm" className="flex-1" />
                                            <span className="text-xs font-semibold text-slate-600 tabular-nums">{project.progress}%</span>
                                        </div>
                                    )}

                                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                                        <div className="flex items-center gap-2">
                                            <AvatarStack users={members.get(project.id) ?? []} max={3} />
                                            <span className="text-xs text-slate-500">
                                                {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                                            </span>
                                        </div>
                                        {completed && project.completedAt ? (
                                            <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-slate-500">
                                                <Icon name="check" className="h-3.5 w-3.5" />
                                                {formatDate(project.completedAt, 'M j, Y')}
                                            </span>
                                        ) : project.dueDate ? (
                                            <span className={cx('inline-flex items-center gap-1 text-xs whitespace-nowrap', overdue ? 'font-semibold text-red-600' : 'text-slate-500')}>
                                                <Icon name={overdue ? 'alert' : 'calendar'} className="h-3.5 w-3.5" />
                                                {formatDate(project.dueDate, 'M j')}
                                            </span>
                                        ) : (
                                            <ProjectStatusBadge status={project.status} />
                                        )}
                                    </div>
                                </Link>
                                <SuggestionStrip
                                    projectId={project.id}
                                    suggestions={suggestions.get(project.id) ?? []}
                                    total={suggestionTotals.get(project.id) ?? 0}
                                    blob={blobEnabled()}
                                    access={blobAccess()}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="mt-6">
                <Pagination page={page} lastPage={lastPage(Number(total), PER_PAGE)} total={Number(total)} perPage={PER_PAGE} href={(p) => withQuery('/projects', { q: q || null, status: status || null, page: p })} />
            </div>
        </>
    );
}

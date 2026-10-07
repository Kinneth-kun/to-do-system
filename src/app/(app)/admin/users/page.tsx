import type { Metadata } from 'next';
import Link from 'next/link';
import { and, count, desc, eq, gt, isNotNull, or } from 'drizzle-orm';
import { toggleUserActiveAction, unlockUserAction } from '@/app/actions/admin';
import { requireAdmin } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { formatDate, now } from '@/lib/dates';
import { Department, ROLE_ADMIN, ROLE_EXECUTIVE, ROLE_USER } from '@/lib/enums';
import { contains } from '@/lib/search';
import { withQuery } from '@/lib/urls';
import { lastPage, paging, param } from '@/lib/views';
import { Icon } from '@/components/icon';
import { ConfirmForm } from '@/components/client/confirm';
import { Avatar, DepartmentBadge, EmptyState, PageHeader, Pagination } from '@/components/ui';

export const metadata: Metadata = { title: 'Users' };

const PER_PAGE = 20;
const { users, roles } = schema;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const admin = await requireAdmin();
    const params = await searchParams;
    const q = param(params.q)?.trim() ?? '';
    const role = [ROLE_ADMIN, ROLE_EXECUTIVE, ROLE_USER].find((r) => r === param(params.role)) ?? '';
    const status = ['active', 'inactive', 'locked'].find((s) => s === param(params.status)) ?? '';
    const department = Department.is(param(params.department)) ? param(params.department)! : '';

    const where = and(
        q ? or(contains(users.name, q), contains(users.username, q), contains(users.email, q)) : undefined,
        role ? eq(roles.name, role) : undefined,
        status === 'active' ? eq(users.isActive, true) : undefined,
        status === 'inactive' ? eq(users.isActive, false) : undefined,
        status === 'locked' ? and(isNotNull(users.lockedUntil), gt(users.lockedUntil, now())) : undefined,
        department ? eq(users.department, department) : undefined,
    );

    const { page, offset } = paging(params, PER_PAGE);
    const [{ total }] = await db().select({ total: count() }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(where);
    const rows = await db()
        .select({ user: users, roleLabel: roles.label })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.roleId))
        .where(where)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(PER_PAGE)
        .offset(offset);

    const filters = { q: q || null, role: role || null, status: status || null, department: department || null };
    const isLocked = (u: typeof users.$inferSelect) => u.lockedUntil !== null && u.lockedUntil.getTime() > now().getTime();

    const toggle = (u: typeof users.$inferSelect, mobile = false) => (
        <ConfirmForm
            action={toggleUserActiveAction.bind(null, u.id)}
            title={`${u.isActive ? 'Deactivate' : 'Activate'} ${u.name}`}
            message={u.isActive ? 'They will be signed out immediately and cannot sign in until reactivated. Their tasks and history are kept.' : 'They will be able to sign in again straight away.'}
            confirm={u.isActive ? 'Deactivate' : 'Activate'}
            danger={u.isActive}
        >
            {mobile ? (
                <button type="submit" className={`btn-sm ${u.isActive ? 'btn-danger' : 'btn-secondary'}`}>
                    <Icon name={u.isActive ? 'pause' : 'check'} className="h-4 w-4" /> {u.isActive ? 'Deactivate' : 'Activate'}
                </button>
            ) : (
                <button type="submit" className={`btn-icon ${u.isActive ? 'text-red-600' : 'text-emerald-600'}`} title={u.isActive ? 'Deactivate user' : 'Activate user'} aria-label={u.isActive ? 'Deactivate user' : 'Activate user'}>
                    <Icon name={u.isActive ? 'pause' : 'check'} className="h-4 w-4" />
                </button>
            )}
        </ConfirmForm>
    );

    const unlock = (u: typeof users.$inferSelect, mobile = false) => (
        <form action={unlockUserAction.bind(null, u.id)}>
            {mobile ? (
                <button type="submit" className="btn-sm btn-secondary">
                    <Icon name="unlock" className="h-4 w-4" /> Unlock
                </button>
            ) : (
                <button type="submit" className="btn-icon text-amber-600" title="Unlock user" aria-label="Unlock user">
                    <Icon name="unlock" className="h-4 w-4" />
                </button>
            )}
        </form>
    );

    return (
        <>
            <PageHeader
                title="Users"
                description="Manage access, roles, and account security."
                actions={
                    <Link href="/admin/users/new" className="btn-primary">
                        <Icon name="plus" className="h-4 w-4" /> Add user
                    </Link>
                }
            />

            <form method="GET" action="/admin/users" className="card mb-6">
                <div className="card-body grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_13rem_auto] lg:items-end">
                    <div>
                        <label htmlFor="q" className="form-label">
                            Search
                        </label>
                        <input id="q" name="q" className="form-input" defaultValue={q} placeholder="Name, username, or email" />
                    </div>
                    <div>
                        <label htmlFor="role" className="form-label">
                            Role
                        </label>
                        <select id="role" name="role" className="form-select" defaultValue={role}>
                            <option value="">All roles</option>
                            <option value="admin">Administrator</option>
                            <option value="executive">Executive</option>
                            <option value="user">User</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="status" className="form-label">
                            Status
                        </label>
                        <select id="status" name="status" className="form-select" defaultValue={status}>
                            <option value="">All statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="locked">Locked</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="department" className="form-label">
                            Department
                        </label>
                        <select id="department" name="department" className="form-select" defaultValue={department}>
                            <option value="">All departments</option>
                            {Department.options().map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="btn-secondary">
                            <Icon name="search" className="h-4 w-4" /> Filter
                        </button>
                    </div>
                </div>
            </form>

            <section className="card">
                <div className="hidden overflow-x-auto md:block">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Department</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th className="hidden lg:table-cell">Last sign in</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length ? (
                                rows.map(({ user: u, roleLabel }) => (
                                    <tr key={u.id}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <Avatar user={u} size="sm" />
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium text-slate-900">{u.name}</div>
                                                    <div className="truncate text-xs text-slate-500">
                                                        {u.username} · {u.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {u.department ? (
                                                <Link href={`/tasks?department=${u.department}`} title="See this department's tasks">
                                                    <DepartmentBadge department={u.department} size="sm" />
                                                </Link>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="chip">{roleLabel}</span>
                                        </td>
                                        <td>
                                            <span className={`chip ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                                            {isLocked(u) && <span className="mt-1 block text-xs text-red-600">Locked</span>}
                                        </td>
                                        <td className="hidden text-sm text-slate-500 lg:table-cell">{u.lastLoginAt ? formatDate(u.lastLoginAt, 'M j, Y g:i A') : 'Never'}</td>
                                        <td>
                                            <div className="flex justify-end gap-1">
                                                <Link href={`/admin/users/${u.id}/edit`} className="btn-icon" title="Edit user" aria-label="Edit user">
                                                    <Icon name="pencil" className="h-4 w-4" />
                                                </Link>
                                                {isLocked(u) && unlock(u)}
                                                {u.id !== admin.id && toggle(u)}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6}>
                                        <EmptyState icon="users" title="No users found" description="Try changing your filters or add a new user." />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="divide-y divide-slate-100 md:hidden">
                    {rows.length ? (
                        rows.map(({ user: u, roleLabel }) => (
                            <div key={u.id} className="space-y-3 p-4">
                                <div className="flex items-start gap-3">
                                    <Avatar user={u} size="md" />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-slate-900">{u.name}</div>
                                        <div className="truncate text-sm text-slate-500">{u.username}</div>
                                        <div className="truncate text-sm text-slate-500">{u.email}</div>
                                    </div>
                                    <Link href={`/admin/users/${u.id}/edit`} className="btn-icon" title="Edit user" aria-label="Edit user">
                                        <Icon name="pencil" className="h-4 w-4" />
                                    </Link>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="chip">{roleLabel}</span>
                                    <span className={`chip ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                                    {isLocked(u) && <span className="chip bg-red-50 text-red-700">Locked</span>}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {isLocked(u) && unlock(u, true)}
                                    {u.id !== admin.id && toggle(u, true)}
                                </div>
                            </div>
                        ))
                    ) : (
                        <EmptyState icon="users" title="No users found" description="Try changing your filters or add a new user." />
                    )}
                </div>
                {Number(total) > PER_PAGE && (
                    <div className="border-t border-slate-100 px-4 py-3">
                        <Pagination page={page} lastPage={lastPage(Number(total), PER_PAGE)} total={Number(total)} perPage={PER_PAGE} href={(p) => withQuery('/admin/users', { ...filters, page: p })} />
                    </div>
                )}
            </section>
        </>
    );
}

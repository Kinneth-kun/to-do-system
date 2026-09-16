<x-layouts.app title="Users">
    <x-page-header title="Users" description="Manage access, roles, and account security.">
        <x-slot:actions>
            <a href="{{ route('admin.users.create') }}" class="btn-primary"><x-icon name="plus" class="h-4 w-4" /> Add user</a>
        </x-slot:actions>
    </x-page-header>

    <form method="GET" action="{{ route('admin.users.index') }}" class="card mb-6">
        <div class="card-body grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_13rem_auto] lg:items-end">
            <x-form.input name="q" label="Search" :value="$filters['search']" placeholder="Name, username, or email" />
            <x-form.select name="role" label="Role" :options="['admin' => 'Administrator', 'user' => 'User']" :value="$filters['role']" placeholder="All roles" />
            <x-form.select name="status" label="Status" :options="['active' => 'Active', 'inactive' => 'Inactive', 'locked' => 'Locked']" :value="$filters['status']" placeholder="All statuses" />
            <x-form.select name="department" label="Department" :options="\App\Enums\Department::options()" :value="$filters['department'] ?? null" placeholder="All departments" />
            <div class="flex gap-2">
                <button type="submit" class="btn-secondary"><x-icon name="search" class="h-4 w-4" /> Filter</button>
                <a href="{{ route('admin.users.index') }}" class="btn-ghost">Clear</a>
            </div>
        </div>
    </form>

    <section class="card">
        <div class="hidden overflow-x-auto md:block">
            <table class="table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Department</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th class="hidden lg:table-cell">Last sign in</th>
                        <th class="text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($users as $user)
                        <tr>
                            <td>
                                <div class="flex items-center gap-3">
                                    <x-avatar :user="$user" size="sm" />
                                    <div class="min-w-0">
                                        <div class="truncate font-medium text-slate-900">{{ $user->name }}</div>
                                        <div class="truncate text-xs text-slate-500">{{ '@'.$user->username }} · {{ $user->email }}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                @if ($user->department)
                                    <a href="{{ route('tasks.index', ['department' => $user->department->value]) }}" title="See this department's tasks">
                                        <x-department-badge :department="$user->department" size="sm" />
                                    </a>
                                @else
                                    <span class="text-xs text-slate-400">—</span>
                                @endif
                            </td>
                            <td><span class="chip">{{ $user->role?->label }}</span></td>
                            <td>
                                <span class="chip {{ $user->is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600' }}">{{ $user->is_active ? 'Active' : 'Inactive' }}</span>
                                @if ($user->isLocked())<span class="mt-1 block text-xs text-red-600">Locked</span>@endif
                            </td>
                            <td class="hidden text-sm text-slate-500 lg:table-cell">{{ $user->last_login_at?->format('M j, Y g:i A') ?: 'Never' }}</td>
                            <td>
                                <div class="flex justify-end gap-1">
                                    <a href="{{ route('admin.users.edit', $user) }}" class="btn-icon" title="Edit user" aria-label="Edit user"><x-icon name="pencil" class="h-4 w-4" /></a>
                                    @if ($user->isLocked())
                                        <form method="POST" action="{{ route('admin.users.unlock', $user) }}">
                                            @csrf
                                            <button type="submit" class="btn-icon text-amber-600" title="Unlock user" aria-label="Unlock user"><x-icon name="unlock" class="h-4 w-4" /></button>
                                        </form>
                                    @endif
                                    @if (! $user->is(auth()->user()))
                                        <form method="POST" action="{{ route('admin.users.toggle-active', $user) }}" onsubmit="return confirm('{{ $user->is_active ? 'Deactivate this user?' : 'Activate this user?' }}')">
                                            @csrf
                                            <button type="submit" class="btn-icon {{ $user->is_active ? 'text-red-600' : 'text-emerald-600' }}" title="{{ $user->is_active ? 'Deactivate user' : 'Activate user' }}" aria-label="{{ $user->is_active ? 'Deactivate user' : 'Activate user' }}"><x-icon name="{{ $user->is_active ? 'pause' : 'check' }}" class="h-4 w-4" /></button>
                                        </form>
                                    @endif
                                </div>
                            </td>
                        </tr>
                    @empty
                        <tr><td colspan="5"><x-empty-state icon="users" title="No users found" description="Try changing your filters or add a new user." /></td></tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        <div class="divide-y divide-slate-100 md:hidden">
            @forelse ($users as $user)
                <div class="space-y-3 p-4">
                    <div class="flex items-start gap-3">
                        <x-avatar :user="$user" size="md" />
                        <div class="min-w-0 flex-1">
                            <div class="font-medium text-slate-900">{{ $user->name }}</div>
                            <div class="truncate text-sm text-slate-500">{{ '@'.$user->username }}</div>
                            <div class="truncate text-sm text-slate-500">{{ $user->email }}</div>
                        </div>
                        <a href="{{ route('admin.users.edit', $user) }}" class="btn-icon" title="Edit user" aria-label="Edit user"><x-icon name="pencil" class="h-4 w-4" /></a>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="chip">{{ $user->role?->label }}</span>
                        <span class="chip {{ $user->is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600' }}">{{ $user->is_active ? 'Active' : 'Inactive' }}</span>
                        @if ($user->isLocked())<span class="chip bg-red-50 text-red-700">Locked</span>@endif
                    </div>
                    <div class="flex flex-wrap gap-2">
                        @if ($user->isLocked())
                            <form method="POST" action="{{ route('admin.users.unlock', $user) }}">@csrf<button type="submit" class="btn-sm btn-secondary"><x-icon name="unlock" class="h-4 w-4" /> Unlock</button></form>
                        @endif
                        @if (! $user->is(auth()->user()))
                            <form method="POST" action="{{ route('admin.users.toggle-active', $user) }}" onsubmit="return confirm('{{ $user->is_active ? 'Deactivate this user?' : 'Activate this user?' }}')">@csrf<button type="submit" class="btn-sm {{ $user->is_active ? 'btn-danger' : 'btn-secondary' }}"><x-icon name="{{ $user->is_active ? 'pause' : 'check' }}" class="h-4 w-4" /> {{ $user->is_active ? 'Deactivate' : 'Activate' }}</button></form>
                        @endif
                    </div>
                </div>
            @empty
                <x-empty-state icon="users" title="No users found" description="Try changing your filters or add a new user." />
            @endforelse
        </div>
        @if ($users->hasPages())<div class="border-t border-slate-100 px-4 py-3">{{ $users->links() }}</div>@endif
    </section>
</x-layouts.app>
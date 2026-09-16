<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\View\View;

class UserController extends Controller
{
    public function index(Request $request): View
    {
        Gate::authorize('admin');

        $query = User::query()->with('role')->latest();
        $search = trim((string) $request->input('q'));
        $role = $request->input('role');
        $status = $request->input('status');

        $query->when($search !== '', fn ($users) => $users->where(function ($users) use ($search) {
            $users->where('name', 'like', "%{$search}%")
                ->orWhere('username', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%");
        }));
        $query->when(in_array($role, [Role::ADMIN, Role::USER], true), fn ($users) => $users->whereHas('role', fn ($roles) => $roles->where('name', $role)));
        $query->when($status === 'active', fn ($users) => $users->where('is_active', true));
        $query->when($status === 'inactive', fn ($users) => $users->where('is_active', false));
        $query->when($status === 'locked', fn ($users) => $users->whereNotNull('locked_until')->where('locked_until', '>', now()));

        return view('admin.users.index', [
            'users' => $query->paginate(20)->withQueryString(),
            'filters' => compact('search', 'role', 'status'),
        ]);
    }

    public function create(): View
    {
        Gate::authorize('admin');

        return view('admin.users.create', ['roles' => Role::query()->orderBy('label')->get()]);
    }

    public function store(Request $request): RedirectResponse
    {
        Gate::authorize('admin');
        $validated = $this->validateUser($request, true);
        $user = User::query()->create($validated);

        ActivityLogger::log('user.created', 'Created user '.$user->name, $user, ['role' => $user->role?->name]);

        return redirect()->route('admin.users.index')->with('success', 'User created.');
    }

    public function edit(User $user): View
    {
        Gate::authorize('admin');

        return view('admin.users.edit', [
            'user' => $user->load('role'),
            'roles' => Role::query()->orderBy('label')->get(),
        ]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        Gate::authorize('admin');
        $validated = $this->validateUser($request);
        $actor = $request->user();
        $requestedRole = Role::query()->findOrFail($validated['role_id']);

        if ($user->is($actor) && $user->role_id !== $requestedRole->id) {
            return back()->with('error', 'You cannot change your own administrator role.');
        }
        if ($user->isAdmin() && $requestedRole->name !== Role::ADMIN && User::query()->admins()->count() <= 1) {
            return back()->with('error', 'The system must keep at least one administrator.');
        }

        $oldRole = $user->role?->name;
        $user->fill($validated)->save();
        ActivityLogger::log('user.updated', 'Updated user '.$user->name, $user);

        if ($oldRole !== $requestedRole->name) {
            ActivityLogger::log('user.role_changed', 'Changed '.$user->name.' role from '.$oldRole.' to '.$requestedRole->name, $user, ['from' => $oldRole, 'to' => $requestedRole->name]);
        }

        return redirect()->route('admin.users.edit', $user)->with('success', 'User updated.');
    }

    public function toggleActive(Request $request, User $user): RedirectResponse
    {
        Gate::authorize('admin');
        if ($user->is($request->user())) {
            return back()->with('error', 'You cannot deactivate your own account.');
        }
        if ($user->is_active && $user->isAdmin() && User::query()->admins()->where('is_active', true)->count() <= 1) {
            return back()->with('error', 'The last active administrator cannot be deactivated.');
        }

        $user->forceFill(['is_active' => ! $user->is_active])->save();
        $action = $user->is_active ? 'activated' : 'deactivated';
        ActivityLogger::log('user.'.$action, ucfirst($action).' user '.$user->name, $user);

        return back()->with('success', 'User '.($user->is_active ? 'activated' : 'deactivated').'.');
    }

    public function unlock(User $user): RedirectResponse
    {
        Gate::authorize('admin');
        $user->forceFill(['failed_login_attempts' => 0, 'locked_until' => null])->save();
        ActivityLogger::log('user.unlocked', 'Unlocked user '.$user->name, $user);

        return back()->with('success', 'User unlocked.');
    }

    public function resetPassword(Request $request, User $user): RedirectResponse
    {
        Gate::authorize('admin');
        $validated = $request->validate([
            'password' => ['required', 'confirmed', Password::defaults()],
        ]);

        $user->forceFill([
            'password' => $validated['password'],
            'failed_login_attempts' => 0,
            'locked_until' => null,
        ])->save();
        ActivityLogger::log('user.password_reset', 'Reset password for '.$user->name, $user);

        return back()->with('success', 'Password reset.');
    }

    /** @return array<string, mixed> */
    private function validateUser(Request $request, bool $withPassword = false): array
    {
        $user = $request->route('user');
        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:50', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('users', 'username')->ignore($user)],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user)],
            'job_title' => ['nullable', 'string', 'max:255'],
            'department' => ['nullable', 'string', 'max:255'],
            'avatar_color' => ['required', 'string', 'in:'.implode(',', User::AVATAR_COLORS)],
            'role_id' => ['required', 'integer', Rule::exists('roles', 'id')],
        ];

        if ($withPassword) {
            $rules['password'] = ['required', 'confirmed', Password::defaults()];
        }

        return $request->validate($rules);
    }
}

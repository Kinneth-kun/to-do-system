<?php

namespace App\Http\Controllers;

use App\Enums\ProjectMemberRole;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ProjectMemberController extends Controller
{
    public function store(Request $request, Project $project): RedirectResponse
    {
        Gate::authorize('manageMembers', $project);
        $data = $request->validate(['user_id' => ['required', 'integer', 'exists:users,id'], 'role' => ['required', 'string', 'in:manager,member']]);
        $user = User::query()->active()->findOrFail($data['user_id']);
        ProjectService::addMember($project, $user, $request->user(), ProjectMemberRole::from($data['role']));

        return back()->with('success', 'Project member added.');
    }

    public function update(Request $request, Project $project, User $user): RedirectResponse
    {
        Gate::authorize('manageMembers', $project);
        $data = $request->validate(['role' => ['required', 'string', 'in:manager,member']]);
        abort_unless($project->isMember($user), 404);
        ProjectService::changeMemberRole($project, $user, ProjectMemberRole::from($data['role']), $request->user());

        return back()->with('success', 'Member role updated.');
    }

    public function destroy(Request $request, Project $project, User $user): RedirectResponse
    {
        Gate::authorize('manageMembers', $project);
        abort_unless($project->isMember($user), 404);
        if (! ProjectService::removeMember($project, $user, $request->user())) {
            return back()->with('warning', 'The project owner cannot be removed.');
        }

        return back()->with('success', 'Project member removed.');
    }
}

<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;

/**
 * Admins: everything (see Gate::before in AppServiceProvider).
 * Users:  view projects they own/created/are members of; any user can create a project;
 *         owner & managers edit and manage members; only the owner deletes.
 */
class ProjectPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Project $project): bool
    {
        return $project->owner_id === $user->id
            || $project->created_by === $user->id
            || $project->isMember($user);
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Project $project): bool
    {
        return $project->isManager($user);
    }

    public function manageMembers(User $user, Project $project): bool
    {
        return $project->isManager($user);
    }

    /** Create tasks inside the project. */
    public function createTask(User $user, Project $project): bool
    {
        return $this->view($user, $project);
    }

    public function delete(User $user, Project $project): bool
    {
        return $project->owner_id === $user->id;
    }
}

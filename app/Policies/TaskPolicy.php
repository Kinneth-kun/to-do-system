<?php

namespace App\Policies;

use App\Models\Task;
use App\Models\User;

/**
 * Admins: everything (Gate::before).
 * view        — project members, the assignee, collaborators
 * update      — (quick update: status/progress/remark) assignee, collaborators, creator, project managers
 * edit        — (details, assignee, dates, collaborators) creator, assignee, project managers
 * delete      — creator, project managers
 * comment     — anyone who can view
 */
class TaskPolicy
{
    public function view(User $user, Task $task): bool
    {
        return $task->assignee_id === $user->id
            || $task->created_by === $user->id
            || $task->isCollaborator($user)
            || ($task->project && app(ProjectPolicy::class)->view($user, $task->project));
    }

    public function update(User $user, Task $task): bool
    {
        return $task->assignee_id === $user->id
            || $task->created_by === $user->id
            || $task->isCollaborator($user)
            || ($task->project && $task->project->isManager($user));
    }

    public function edit(User $user, Task $task): bool
    {
        return $task->created_by === $user->id
            || $task->assignee_id === $user->id
            || ($task->project && $task->project->isManager($user));
    }

    public function manageCollaborators(User $user, Task $task): bool
    {
        return $this->edit($user, $task);
    }

    /** Add a subtask under this task. */
    public function addSubtask(User $user, Task $task): bool
    {
        return $task->parent_id === null && $this->view($user, $task);
    }

    public function comment(User $user, Task $task): bool
    {
        return $this->view($user, $task);
    }

    public function delete(User $user, Task $task): bool
    {
        return $task->created_by === $user->id
            || ($task->project && $task->project->isManager($user));
    }
}

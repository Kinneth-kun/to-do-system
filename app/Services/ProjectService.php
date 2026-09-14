<?php

namespace App\Services;

use App\Enums\ProjectMemberRole;
use App\Enums\ProjectStatus;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class ProjectService
{
    /**
     * @param  array{name:string, description?:string|null, owner_id?:int|null, status?:string, priority?:string,
     *               color?:string, start_date?:string|null, due_date?:string|null, member_ids?:array<int>} $data
     */
    public static function create(array $data, User $actor): Project
    {
        return DB::transaction(function () use ($data, $actor) {
            $project = new Project(Arr::only($data, ['name', 'description', 'status', 'priority', 'color', 'start_date', 'due_date']));
            $project->owner_id = $data['owner_id'] ?? $actor->id;
            $project->created_by = $actor->id;
            $project->status ??= ProjectStatus::Active;
            $project->priority ??= 'medium';
            $project->color ??= Project::COLORS[array_rand(Project::COLORS)];
            if ($project->status === ProjectStatus::Completed) {
                $project->completed_at = now();
            }
            $project->save();

            $project->addMember($project->owner_id, $actor, ProjectMemberRole::Manager);
            $project->addMember($actor, $actor, $actor->id === $project->owner_id ? ProjectMemberRole::Manager : ProjectMemberRole::Member);

            if ($project->owner_id !== $actor->id) {
                NotificationService::projectMemberAdded($project, $project->owner, $actor);
            }

            foreach ((array) ($data['member_ids'] ?? []) as $userId) {
                if ($user = User::query()->find($userId)) {
                    self::addMember($project, $user, $actor, log: false);
                }
            }

            ActivityLogger::log('project.created', 'Created project "'.$project->name.'"', $project, [], $actor);
            ProjectHealthService::refresh($project);

            return $project;
        });
    }

    /** @param array<string, mixed> $data */
    public static function update(Project $project, array $data, User $actor): Project
    {
        return DB::transaction(function () use ($project, $data, $actor) {
            $oldStatus = $project->status;
            $oldOwner = $project->owner_id;
            $project->fill(Arr::only($data, ['name', 'description', 'owner_id', 'status', 'priority', 'color', 'start_date', 'due_date']));

            if (! $project->isDirty()) {
                return $project;
            }

            $changed = array_keys($project->getDirty());

            if ($project->isDirty('status')) {
                $project->completed_at = $project->status === ProjectStatus::Completed ? now() : null;
            }
            $project->save();

            if ($project->owner_id !== $oldOwner) {
                $project->addMember($project->owner_id, $actor, ProjectMemberRole::Manager);
                $project->members()->updateExistingPivot($project->owner_id, ['role' => ProjectMemberRole::Manager->value]);
                if ($project->owner_id !== $actor->id) {
                    NotificationService::projectMemberAdded($project, $project->owner()->first(), $actor);
                }
            }

            if ($oldStatus !== $project->status) {
                ActivityLogger::log('project.status_changed', 'Changed project "'.$project->name.'" status from '.$oldStatus->label().' to '.$project->status->label(), $project,
                    ['old_status' => $oldStatus->value, 'new_status' => $project->status->value], $actor);
            }
            ActivityLogger::log('project.updated', 'Updated project "'.$project->name.'" ('.implode(', ', $changed).')', $project, ['fields' => $changed], $actor);

            ProjectHealthService::refresh($project);

            return $project;
        });
    }

    public static function addMember(Project $project, User $user, User $actor, ProjectMemberRole $role = ProjectMemberRole::Member, bool $log = true): bool
    {
        $added = $project->addMember($user, $actor, $role);
        if (! $added) {
            return false;
        }

        if ($log) {
            ActivityLogger::log('project.member_added', 'Added '.$user->name.' to project "'.$project->name.'"', $project, ['user_id' => $user->id, 'role' => $role->value], $actor);
        }
        if ($user->id !== $actor->id) {
            NotificationService::projectMemberAdded($project, $user, $actor);
        }

        return true;
    }

    public static function removeMember(Project $project, User $user, User $actor): bool
    {
        if ($project->owner_id === $user->id) {
            return false; // the owner cannot be removed; transfer ownership first
        }

        $removed = $project->members()->detach($user->id) > 0;
        $project->flushMembershipCache();
        if ($removed) {
            ActivityLogger::log('project.member_removed', 'Removed '.$user->name.' from project "'.$project->name.'"', $project, ['user_id' => $user->id], $actor);
        }

        return $removed;
    }

    public static function changeMemberRole(Project $project, User $user, ProjectMemberRole $role, User $actor): bool
    {
        if ($project->owner_id === $user->id || ! $project->isMember($user)) {
            return false; // the owner is always a manager
        }

        $project->members()->updateExistingPivot($user->id, ['role' => $role->value]);
        $project->flushMembershipCache();
        ActivityLogger::log('project.member_role_changed', 'Changed '.$user->name.'\'s role in "'.$project->name.'" to '.$role->label(), $project, ['user_id' => $user->id, 'role' => $role->value], $actor);

        return true;
    }

    public static function delete(Project $project, User $actor): void
    {
        DB::transaction(function () use ($project, $actor) {
            $project->allTasks()->each(fn ($task) => $task->delete());
            $project->delete();
            ActivityLogger::log('project.deleted', 'Deleted project "'.$project->name.'"', $project, [], $actor);
        });
    }
}

<?php

namespace App\Services;

use App\Enums\TaskStatus;
use App\Enums\TaskUpdateType;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskUpdate;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Single entry point for task mutations. Enforces business rules:
 *  - every task belongs to a project; subtasks inherit their parent's project; one subtask level
 *  - single primary assignee; project membership is never granted implicitly — people are
 *    added to a project only by an explicit choice (see ProjectService::addMember)
 *  - status ⇄ progress sync (0% Pending, 1–99% In Progress, 100% Completed)
 *  - append-only update history for every status/progress/remark/assignment change
 *  - parent progress rolls up from subtasks; project progress/health recalculated
 *  - overdue open tasks become Delayed; rescheduling clears an automatic delay
 */
class TaskService
{
    /* ============================================================== Create */

    /**
     * @param  array{project_id?:int, parent_id?:int|null, title:string, description?:string|null, priority?:string,
     *               assignee_id?:int|null, start_date?:string|null, due_date?:string|null, status?:string|null,
     *               progress?:int|null, collaborator_ids?:array<int>} $data
     */
    public static function create(array $data, User $actor): Task
    {
        return DB::transaction(function () use ($data, $actor) {
            $parent = null;
            if (! empty($data['parent_id'])) {
                $parent = Task::query()->findOrFail($data['parent_id']);
                if ($parent->parent_id !== null) {
                    throw ValidationException::withMessages(['parent_id' => 'Subtasks cannot have their own subtasks.']);
                }
                $data['project_id'] = $parent->project_id;
            }

            if (empty($data['project_id'])) {
                throw ValidationException::withMessages(['project_id' => 'Please choose a project.']);
            }

            $project = Project::query()->findOrFail($data['project_id']);

            $progress = self::clampProgress($data['progress'] ?? 0);
            $status = ! empty($data['status']) ? TaskStatus::from($data['status']) : TaskStatus::fromProgress($progress);
            [$status, $progress] = self::normalize($status, $progress);

            $task = new Task(Arr::only($data, ['title', 'description', 'priority', 'assignee_id', 'start_date', 'due_date']));
            $task->project_id = $project->id;
            $task->parent_id = $parent?->id;
            $task->priority ??= 'medium';
            $task->status = $status;
            $task->progress = $progress;
            $task->created_by = $actor->id;
            $task->completed_at = $status === TaskStatus::Completed ? now() : null;
            $task->latest_update_at = now();
            $task->latest_update_by = $actor->id;
            $task->position = (int) Task::query()->where('project_id', $project->id)->where('parent_id', $parent?->id)->max('position') + 1;
            $task->save();

            self::record($task, $actor, TaskUpdateType::Created, null, $task->status, null, $task->progress);

            ActivityLogger::log('task.created',
                ($parent ? 'Created subtask "' : 'Created task "').$task->title.'" in '.$project->name,
                $task, ['project_id' => $project->id, 'parent_id' => $parent?->id], $actor);

            if ($task->assignee_id && $task->assignee_id !== $actor->id) {
                NotificationService::taskAssigned($task, $task->assignee, $actor);
            }

            foreach ((array) ($data['collaborator_ids'] ?? []) as $userId) {
                if ($user = User::query()->find($userId)) {
                    self::addCollaborator($task, $user, $actor, refresh: false);
                }
            }

            self::syncDelay($task);
            self::afterChange($task, $actor);

            return $task->fresh(['project', 'assignee', 'parent']);
        });
    }

    /* ============================================================== Quick update (status / progress / remark) */

    /**
     * Apply a status/progress/remark update and record it in history.
     * Returns null when nothing changed and no remark was given.
     */
    public static function applyUpdate(Task $task, User $actor, ?string $status = null, int|string|null $progress = null, ?string $remark = null): ?TaskUpdate
    {
        return DB::transaction(function () use ($task, $actor, $status, $progress, $remark) {
            $task->refresh();
            $remark = filled($remark) ? trim($remark) : null;
            $oldStatus = $task->status;
            $oldProgress = $task->progress;

            $requestedStatus = filled($status) ? TaskStatus::from($status) : null;
            $requestedProgress = ($progress !== null && $progress !== '') ? self::clampProgress((int) $progress) : null;

            // Forms submit both fields; an unchanged status means "progress drives".
            if ($requestedStatus === $oldStatus && $requestedProgress !== null && $requestedProgress !== $oldProgress) {
                $requestedStatus = null;
            }

            $hasSubtasks = $task->subtasks()->where('status', '!=', TaskStatus::Cancelled->value)->exists();

            if ($hasSubtasks) {
                // Progress is calculated from subtasks; only hold/cancel/delay can be set manually.
                $requestedProgress = null;
                if ($requestedStatus && in_array($requestedStatus, [TaskStatus::Pending, TaskStatus::InProgress, TaskStatus::Completed], true)) {
                    $requestedStatus = TaskStatus::fromProgress($oldProgress);
                }
            }

            [$newStatus, $newProgress] = self::resolve($oldStatus, $oldProgress, $requestedStatus, $requestedProgress);

            // Choosing Pending/In Progress on an overdue task keeps it Delayed (auto-delay rule).
            $requestedBeforeDelay = null;
            if ($newStatus->canAutoDelay() && self::shouldBeDelayed($task)) {
                $requestedBeforeDelay = $newStatus;
                $newStatus = TaskStatus::Delayed;
            }

            $statusChanged = $newStatus !== $oldStatus;
            $progressChanged = $newProgress !== $oldProgress;

            if (! $statusChanged && ! $progressChanged && $remark === null) {
                return null;
            }

            $task->status = $newStatus;
            $task->progress = $newProgress;
            self::applyStatusSideFields($task, $oldStatus, $requestedBeforeDelay);
            if ($remark !== null) {
                $task->latest_remark = $remark;
            }
            $task->latest_update_at = now();
            $task->latest_update_by = $actor->id;
            $task->save();

            $type = ($statusChanged || $progressChanged) ? TaskUpdateType::Update : TaskUpdateType::Remark;
            $update = self::record($task, $actor, $type, $oldStatus, $newStatus, $oldProgress, $newProgress, $remark,
                $requestedBeforeDelay ? ['requested_status' => $requestedBeforeDelay->value] : []);

            [$action, $description] = match (true) {
                $statusChanged && $newStatus === TaskStatus::Completed => ['task.completed', 'Completed "'.$task->title.'"'],
                $statusChanged => ['task.status_changed', 'Changed "'.$task->title.'" from '.$oldStatus->label().' to '.$newStatus->label()],
                $progressChanged => ['task.progress_updated', 'Updated "'.$task->title.'" progress '.$oldProgress.'% → '.$newProgress.'%'],
                default => ['task.remark_added', 'Added a remark on "'.$task->title.'"'],
            };
            ActivityLogger::log($action, $description, $task, array_filter([
                'old_status' => $oldStatus->value, 'new_status' => $newStatus->value,
                'old_progress' => $oldProgress, 'new_progress' => $newProgress,
            ], fn ($v) => $v !== null), $actor);

            if ($statusChanged && $newStatus === TaskStatus::Completed) {
                NotificationService::taskCompleted($task, $actor);
            }
            if ($remark !== null) {
                NotificationService::mentions($remark, $task, $update, $actor);
            }

            self::afterChange($task, $actor);

            return $update;
        });
    }

    /* ============================================================== Edit details */

    /**
     * Update editable details (title, description, priority, dates, assignee).
     *
     * @param  array<string, mixed>  $data
     */
    public static function updateDetails(Task $task, array $data, User $actor): Task
    {
        return DB::transaction(function () use ($task, $data, $actor) {
            $fields = ['title', 'description', 'priority', 'start_date', 'due_date', 'assignee_id'];
            $task->fill(Arr::only($data, $fields));

            if (! $task->isDirty()) {
                return $task;
            }

            $dirty = $task->getDirty();
            $changes = [];
            foreach ($dirty as $field => $value) {
                $old = $task->getOriginal($field);
                $changes[$field] = [
                    'old' => $old instanceof \BackedEnum ? $old->value : ($old instanceof \DateTimeInterface ? $old->format('Y-m-d') : $old),
                    'new' => $task->$field instanceof \BackedEnum ? $task->$field->value : ($task->$field instanceof \DateTimeInterface ? $task->$field->format('Y-m-d') : $value),
                ];
            }
            // Ignore no-op date string differences like "2026-01-01" vs "2026-01-01 00:00:00".
            $changes = array_filter($changes, fn ($c) => (string) $c['old'] !== (string) $c['new']);
            if ($changes === []) {
                $task->syncOriginal();

                return $task;
            }

            $assigneeChanged = array_key_exists('assignee_id', $changes);
            $oldAssigneeId = $changes['assignee_id']['old'] ?? null;

            $task->latest_update_at = now();
            $task->latest_update_by = $actor->id;
            $task->save();

            $detailChanges = Arr::except($changes, ['assignee_id']);
            if ($detailChanges !== []) {
                self::record($task, $actor, TaskUpdateType::DetailsChanged, meta: ['changes' => $detailChanges]);
                ActivityLogger::log('task.updated', 'Edited "'.$task->title.'" ('.implode(', ', array_keys($detailChanges)).')', $task, ['changes' => $detailChanges], $actor);
            }

            if ($assigneeChanged) {
                $newAssignee = $task->assignee_id ? User::query()->find($task->assignee_id) : null;
                $oldAssignee = $oldAssigneeId ? User::query()->find($oldAssigneeId) : null;
                self::record($task, $actor, TaskUpdateType::Assignment, meta: [
                    'old_assignee_id' => $oldAssignee?->id, 'old_assignee' => $oldAssignee?->name,
                    'new_assignee_id' => $newAssignee?->id, 'new_assignee' => $newAssignee?->name,
                ]);
                ActivityLogger::log('task.assigned',
                    $newAssignee ? 'Assigned "'.$task->title.'" to '.$newAssignee->name : 'Unassigned "'.$task->title.'"',
                    $task, ['old_assignee_id' => $oldAssignee?->id, 'new_assignee_id' => $newAssignee?->id], $actor);

                if ($newAssignee) {
                    // A person can't be both the primary assignee and a collaborator.
                    $task->collaborators()->detach($newAssignee->id);
                    if ($newAssignee->id !== $actor->id) {
                        NotificationService::taskAssigned($task, $newAssignee, $actor);
                    }
                }
            }

            if (array_key_exists('due_date', $changes)) {
                self::syncDelay($task);
            }

            self::afterChange($task, $actor);

            return $task->fresh(['project', 'assignee', 'parent']);
        });
    }

    /* ============================================================== Collaborators */

    public static function addCollaborator(Task $task, User $user, User $actor, bool $refresh = true): bool
    {
        if ($task->assignee_id === $user->id || $task->isCollaborator($user)) {
            return false;
        }

        $task->collaborators()->attach($user->id, ['added_by' => $actor->id]);

        ActivityLogger::log('collaborator.added', 'Added '.$user->name.' as collaborator on "'.$task->title.'"', $task, ['user_id' => $user->id], $actor);
        if ($user->id !== $actor->id) {
            NotificationService::collaboratorAdded($task, $user, $actor);
        }

        return true;
    }

    public static function removeCollaborator(Task $task, User $user, User $actor): bool
    {
        $detached = $task->collaborators()->detach($user->id) > 0;
        if ($detached) {
            ActivityLogger::log('collaborator.removed', 'Removed '.$user->name.' from "'.$task->title.'"', $task, ['user_id' => $user->id], $actor);
        }

        return $detached;
    }

    /* ============================================================== Delete */

    public static function delete(Task $task, User $actor): void
    {
        DB::transaction(function () use ($task, $actor) {
            $parent = $task->parent;
            $project = $task->project;

            $task->subtasks()->each(fn (Task $sub) => $sub->delete());
            $task->delete();

            ActivityLogger::log('task.deleted', 'Deleted '.($parent ? 'subtask' : 'task').' "'.$task->title.'" from '.$project->name, $task, ['project_id' => $project->id], $actor);

            if ($parent) {
                self::rollupParent($parent, $actor);
            }
            ProjectHealthService::refresh($project);
        });
    }

    /* ============================================================== Delay handling */

    public static function shouldBeDelayed(Task $task): bool
    {
        return Settings::bool('deadline.auto_delay_enabled')
            && $task->due_date !== null
            && $task->due_date->lt(today());
    }

    /**
     * Apply or clear the automatic Delayed status based on the due date.
     * Returns true if the status changed.
     */
    public static function syncDelay(Task $task): bool
    {
        if ($task->status->canAutoDelay() && self::shouldBeDelayed($task)) {
            $old = $task->status;
            $task->status_before_delay = $old;
            $task->status = TaskStatus::Delayed;
            $task->delayed_at = now();
            $task->save();

            self::record($task, null, TaskUpdateType::AutoDelayed, $old, TaskStatus::Delayed, $task->progress, $task->progress,
                meta: ['due_date' => $task->due_date->toDateString()]);
            ActivityLogger::log('task.delayed', '"'.$task->title.'" was automatically marked Delayed (due '.$task->due_date->format('M j, Y').')', $task, [], null);
            NotificationService::taskDelayed($task);

            return true;
        }

        // Rescheduled → restore the progress-driven status. Only call this branch after a due-date change,
        // so a manually chosen Delayed status is not cleared by the periodic check.
        if ($task->status === TaskStatus::Delayed && $task->delayed_at !== null && ! self::shouldBeDelayed($task)) {
            $restored = TaskStatus::fromProgress(min($task->progress, 99));

            $task->status = $restored;
            $task->status_before_delay = null;
            $task->delayed_at = null;
            $task->save();

            self::record($task, null, TaskUpdateType::Undelayed, TaskStatus::Delayed, $restored, $task->progress, $task->progress,
                meta: ['due_date' => $task->due_date?->toDateString()]);

            return true;
        }

        return false;
    }

    /* ============================================================== Roll-ups */

    /** Recalculate a parent's progress/status from its subtasks. */
    public static function rollupParent(Task $parent, ?User $actor = null): void
    {
        $parent->refresh();
        $subtasks = $parent->subtasks()->where('status', '!=', TaskStatus::Cancelled->value)->get(['id', 'progress', 'status']);
        if ($subtasks->isEmpty()) {
            return;
        }

        $oldStatus = $parent->status;
        $oldProgress = $parent->progress;
        $newProgress = (int) round($subtasks->avg('progress'));
        if ($newProgress === 100 && $subtasks->contains(fn ($s) => $s->status !== TaskStatus::Completed)) {
            $newProgress = 99;
        }

        $newStatus = $oldStatus;
        if (! in_array($oldStatus, [TaskStatus::OnHold, TaskStatus::Cancelled], true)) {
            $newStatus = TaskStatus::fromProgress($newProgress);
            if ($newStatus->canAutoDelay() && self::shouldBeDelayed($parent)) {
                $newStatus = TaskStatus::Delayed;
            }
        }

        if ($newStatus === $oldStatus && $newProgress === $oldProgress) {
            return;
        }

        $parent->status = $newStatus;
        $parent->progress = $newProgress;
        self::applyStatusSideFields($parent, $oldStatus, $newStatus === TaskStatus::Delayed ? TaskStatus::fromProgress($newProgress) : null);
        $parent->save();

        self::record($parent, null, TaskUpdateType::Rollup, $oldStatus, $newStatus, $oldProgress, $newProgress,
            meta: ['triggered_by' => $actor?->id]);

        if ($newStatus === TaskStatus::Completed && $oldStatus !== TaskStatus::Completed) {
            ActivityLogger::log('task.completed', '"'.$parent->title.'" completed (all subtasks done)', $parent, [], $actor);
            NotificationService::taskCompleted($parent, $actor);
        }
    }

    public static function afterChange(Task $task, ?User $actor = null): void
    {
        if ($task->parent_id) {
            self::rollupParent($task->parent()->firstOrFail(), $actor);
        }
        ProjectHealthService::refresh($task->project()->firstOrFail());
    }

    /* ============================================================== Internals */

    public static function clampProgress(int|string|null $value): int
    {
        return max(0, min(100, (int) $value));
    }

    /** Make status and progress agree with each other. */
    public static function normalize(TaskStatus $status, int $progress): array
    {
        return match ($status) {
            TaskStatus::Pending => [$status, 0],
            TaskStatus::Completed => [$status, 100],
            TaskStatus::InProgress => [$status, max(1, min(99, $progress))],
            default => [$status, $progress],
        };
    }

    /**
     * @return array{0: TaskStatus, 1: int}
     */
    private static function resolve(TaskStatus $oldStatus, int $oldProgress, ?TaskStatus $status, ?int $progress): array
    {
        if ($status !== null) {
            // Explicit status wins; progress adjusted to match.
            return self::normalize($status, $progress ?? $oldProgress);
        }

        if ($progress === null) {
            return [$oldStatus, $oldProgress];
        }

        // Progress only.
        return match ($oldStatus) {
            TaskStatus::Pending, TaskStatus::InProgress, TaskStatus::Completed => [TaskStatus::fromProgress($progress), $progress],
            TaskStatus::Delayed, TaskStatus::OnHold => [$progress >= 100 ? TaskStatus::Completed : $oldStatus, $progress],
            TaskStatus::Cancelled => [$oldStatus, $progress],
        };
    }

    private static function applyStatusSideFields(Task $task, TaskStatus $oldStatus, ?TaskStatus $beforeDelay = null): void
    {
        if ($task->status === TaskStatus::Completed) {
            $task->completed_at ??= now();
        } else {
            $task->completed_at = null;
        }

        if ($task->status === TaskStatus::Delayed) {
            if ($oldStatus !== TaskStatus::Delayed) {
                $task->delayed_at = now();
                $task->status_before_delay = $beforeDelay ?? $oldStatus;
            }
        } else {
            $task->delayed_at = null;
            $task->status_before_delay = null;
        }
    }

    private static function record(
        Task $task,
        ?User $actor,
        TaskUpdateType $type,
        ?TaskStatus $oldStatus = null,
        ?TaskStatus $newStatus = null,
        ?int $oldProgress = null,
        ?int $newProgress = null,
        ?string $remark = null,
        array $meta = [],
    ): TaskUpdate {
        return TaskUpdate::query()->create([
            'task_id' => $task->id,
            'user_id' => $actor?->id,
            'type' => $type,
            'old_status' => $oldStatus,
            'new_status' => $newStatus,
            'old_progress' => $oldProgress,
            'new_progress' => $newProgress,
            'remark' => $remark,
            'meta' => $meta ?: null,
        ]);
    }
}

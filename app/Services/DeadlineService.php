<?php

namespace App\Services;

use App\Enums\NotificationType;
use App\Enums\TaskStatus;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Facades\Cache;

/**
 * Automatic delay detection and deadline reminders.
 *
 * Runs from the scheduler (`php artisan taskflow:check-deadlines`, hourly) and, so the app works
 * without a cron job, lazily at most every 5 minutes from the RunDeadlineChecks middleware.
 */
class DeadlineService
{
    /** @return array{delayed:int, reminders:int, projects:int} */
    public static function run(): array
    {
        $delayed = self::markOverdueTasksDelayed();
        $reminders = self::sendDeadlineReminders();
        $projects = ProjectHealthService::refreshAll();

        return compact('delayed', 'reminders', 'projects');
    }

    /** Run at most once per $seconds across all requests. */
    public static function runThrottled(int $seconds = 300): void
    {
        if (Cache::add('taskflow.deadline-check', true, $seconds)) {
            self::run();
        }
    }

    public static function markOverdueTasksDelayed(): int
    {
        if (! Settings::bool('deadline.auto_delay_enabled')) {
            return 0;
        }

        $count = 0;
        $parents = [];
        $projects = [];

        Task::query()
            ->with('project')
            ->whereIn('status', [TaskStatus::Pending->value, TaskStatus::InProgress->value])
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', today())
            ->whereHas('project')
            ->orderBy('id')
            ->chunkById(200, function ($tasks) use (&$count, &$parents, &$projects) {
                foreach ($tasks as $task) {
                    if (TaskService::syncDelay($task)) {
                        $count++;
                        $projects[$task->project_id] = true;
                        if ($task->parent_id) {
                            $parents[$task->parent_id] = true;
                        }
                    }
                }
            });

        foreach (array_keys($parents) as $parentId) {
            if ($parent = Task::query()->find($parentId)) {
                TaskService::rollupParent($parent);
            }
        }

        foreach (array_keys($projects) as $projectId) {
            if ($project = Project::query()->find($projectId)) {
                ProjectHealthService::refresh($project);
            }
        }

        return $count;
    }

    /** Notify assignee + collaborators once per task per due date when inside the due-soon window. */
    public static function sendDeadlineReminders(): int
    {
        $sent = 0;

        Task::query()
            ->with('project')
            ->dueSoon()
            ->whereNotNull('assignee_id')
            ->whereHas('project')
            ->orderBy('id')
            ->chunkById(200, function ($tasks) use (&$sent) {
                foreach ($tasks as $task) {
                    $already = Notification::query()
                        ->where('type', NotificationType::DeadlineApproaching->value)
                        ->where('subject_type', $task->getMorphClass())
                        ->where('subject_id', $task->id)
                        ->where('data->due_date', $task->due_date->toDateString())
                        ->exists();

                    if (! $already) {
                        NotificationService::deadlineApproaching($task);
                        $sent++;
                    }
                }
            });

        return $sent;
    }
}

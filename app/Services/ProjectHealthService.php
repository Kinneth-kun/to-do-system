<?php

namespace App\Services;

use App\Enums\ProjectHealth;
use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Models\Project;

/**
 * Calculates project progress and health. Thresholds are configurable in Settings (group "Project health").
 *
 * Rules, evaluated in order:
 *  1. Project status Completed                          → Completed
 *  2. Project status On Hold or Cancelled               → On Hold
 *  3. Has tasks and every non-cancelled task completed  → Completed
 *  4. Project past its due date (if enabled)            → Delayed
 *  5. Delayed share of open tasks ≥ delayed threshold   → Delayed
 *  6. Delayed share of open tasks ≥ at-risk threshold   → At Risk
 *  7. Behind expected (time-based) progress by ≥ gap    → At Risk
 *  8. Inside due-soon window with low progress          → At Risk
 *  9. Otherwise                                         → On Track
 */
class ProjectHealthService
{
    /** Recalculate and persist cached progress + health. */
    public static function refresh(Project $project): Project
    {
        $project->progress = self::calculateProgress($project);
        $project->health = self::evaluate($project)['health'];
        $project->saveQuietly();

        return $project;
    }

    /** Average progress of top-level, non-cancelled tasks (parents already roll up their subtasks). */
    public static function calculateProgress(Project $project): int
    {
        $avg = $project->tasks()
            ->where('status', '!=', TaskStatus::Cancelled->value)
            ->avg('progress');

        return (int) round((float) $avg);
    }

    /**
     * @return array{health: ProjectHealth, reasons: list<string>, stats: array<string,int|float>}
     */
    public static function evaluate(Project $project): array
    {
        $s = Settings::all();
        $counts = $project->taskCounts();

        $nonCancelled = $counts['total'] - $counts[TaskStatus::Cancelled->value];
        $open = $counts[TaskStatus::Pending->value] + $counts[TaskStatus::InProgress->value] + $counts[TaskStatus::Delayed->value];
        $overdueNotFlagged = $project->allTasks()
            ->whereIn('status', [TaskStatus::Pending->value, TaskStatus::InProgress->value])
            ->whereNotNull('due_date')->whereDate('due_date', '<', today())->count();
        $delayed = $counts[TaskStatus::Delayed->value] + $overdueNotFlagged;
        $delayedPct = $open > 0 ? round($delayed / $open * 100, 1) : 0.0;
        $progress = $project->progress ?? self::calculateProgress($project);

        $expected = null;
        if ($project->start_date && $project->due_date && $project->due_date->gt($project->start_date)) {
            $total = $project->start_date->diffInDays($project->due_date);
            $elapsed = $project->start_date->diffInDays(today(), false);
            $expected = (int) max(0, min(100, round($elapsed / $total * 100)));
        }

        $stats = [
            'total' => $counts['total'],
            'open' => $open,
            'completed' => $counts[TaskStatus::Completed->value],
            'delayed' => $delayed,
            'delayed_percent' => $delayedPct,
            'progress' => $progress,
            'expected_progress' => $expected ?? -1,
        ];

        $result = fn (ProjectHealth $h, array $reasons) => ['health' => $h, 'reasons' => $reasons, 'stats' => $stats];

        if ($project->status === ProjectStatus::Completed) {
            return $result(ProjectHealth::Completed, ['Project is marked completed.']);
        }
        if (in_array($project->status, [ProjectStatus::OnHold, ProjectStatus::Cancelled], true)) {
            return $result(ProjectHealth::OnHold, ['Project is '.$project->status->label().'.']);
        }
        if ($nonCancelled > 0 && $counts[TaskStatus::Completed->value] === $nonCancelled) {
            return $result(ProjectHealth::Completed, ['All tasks are completed.']);
        }

        $reasons = [];

        if ($s['health.overdue_project_is_delayed'] && $project->isOverdue()) {
            $reasons[] = 'Project is past its due date ('.$project->due_date->format('M j, Y').').';

            return $result(ProjectHealth::Delayed, $reasons);
        }

        if ($delayed > 0 && $delayedPct >= $s['health.delayed_delayed_percent']) {
            return $result(ProjectHealth::Delayed, ["{$delayed} of {$open} open tasks are delayed ({$delayedPct}%)."]);
        }

        if ($delayed > 0 && $delayedPct >= $s['health.at_risk_delayed_percent']) {
            $reasons[] = "{$delayed} of {$open} open tasks are delayed ({$delayedPct}%).";
        }

        if ($expected !== null && $expected - $progress >= $s['health.progress_gap_percent']) {
            $reasons[] = "Progress is {$progress}% but {$expected}% of the schedule has elapsed.";
        }

        if ($project->due_date
            && $project->due_date->betweenIncluded(today(), today()->addDays($s['deadline.due_soon_days']))
            && $progress < $s['health.due_soon_progress_percent']) {
            $reasons[] = 'Due '.$project->due_date->format('M j').' with only '.$progress.'% progress.';
        }

        if ($reasons !== []) {
            return $result(ProjectHealth::AtRisk, $reasons);
        }

        return $result(ProjectHealth::OnTrack, ['No delayed tasks and progress is on schedule.']);
    }

    /** Recalculate every non-archived project (used by the scheduled check and after settings change). */
    public static function refreshAll(): int
    {
        $n = 0;
        Project::query()->chunkById(100, function ($projects) use (&$n) {
            foreach ($projects as $project) {
                self::refresh($project);
                $n++;
            }
        });

        return $n;
    }
}

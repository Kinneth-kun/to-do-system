<?php

namespace Tests\Feature\Foundation;

use App\Enums\NotificationType;
use App\Enums\ProjectHealth;
use App\Enums\TaskStatus;
use App\Enums\TaskUpdateType;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskUpdate;
use App\Models\User;
use App\Services\DeadlineService;
use App\Services\ProjectHealthService;
use App\Services\ProjectService;
use App\Services\TaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use LogicException;
use Tests\TestCase;

class TaskServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $member;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = $this->regularUser(['name' => 'Olivia Owner']);
        $this->member = $this->regularUser(['name' => 'Mark Member']);
        $this->actingAs($this->owner);
        $this->project = ProjectService::create(['name' => 'Website Revamp', 'due_date' => now()->addMonth()->toDateString()], $this->owner);
    }

    public function test_create_task_records_history_and_notifies_assignee(): void
    {
        $task = TaskService::create(['project_id' => $this->project->id, 'title' => 'Design homepage', 'assignee_id' => $this->member->id], $this->owner);

        $this->assertSame(TaskStatus::Pending, $task->status);
        $this->assertSame(0, $task->progress);
        $this->assertSame(1, $task->updates()->where('type', TaskUpdateType::Created->value)->count());
        $this->assertTrue(Notification::query()->where('user_id', $this->member->id)->where('type', NotificationType::TaskAssigned->value)->exists());
    }

    public function test_project_membership_is_never_granted_implicitly(): void
    {
        $outsider = $this->regularUser();

        // Assigning work does not enrol anyone in the project...
        $task = TaskService::create(['project_id' => $this->project->id, 'title' => 'Externally assigned', 'assignee_id' => $outsider->id], $this->owner);
        $this->assertFalse($this->project->fresh()->isMember($outsider), 'assignee must not be auto-added');

        // ...nor does collaborating on it...
        $collaborator = $this->regularUser();
        TaskService::addCollaborator($task, $collaborator, $this->owner);
        $this->assertFalse($this->project->fresh()->isMember($collaborator), 'collaborator must not be auto-added');

        // ...nor does being reassigned later.
        $another = $this->regularUser();
        TaskService::updateDetails($task->fresh(), ['assignee_id' => $another->id], $this->owner);
        $this->assertFalse($this->project->fresh()->isMember($another), 'new assignee must not be auto-added');

        // The assignee can still work on the task they were given.
        $this->assertTrue($another->can('view', $task->fresh()));
        $this->assertTrue($another->can('update', $task->fresh()));

        // Membership only happens when somebody chooses it.
        ProjectService::addMember($this->project, $outsider, $this->owner);
        $this->assertTrue($this->project->fresh()->isMember($outsider));
    }

    public function test_progress_drives_status_and_history_keeps_old_and_new_values(): void
    {
        $task = TaskService::create(['project_id' => $this->project->id, 'title' => 'Write copy', 'assignee_id' => $this->member->id], $this->owner);

        $update = TaskService::applyUpdate($task, $this->member, null, 40, 'Draft underway');
        $task->refresh();
        $this->assertSame(TaskStatus::InProgress, $task->status);
        $this->assertSame(40, $task->progress);
        $this->assertSame('Draft underway', $task->latest_remark);
        $this->assertSame(TaskStatus::Pending, $update->old_status);
        $this->assertSame(TaskStatus::InProgress, $update->new_status);
        $this->assertSame(0, $update->old_progress);
        $this->assertSame(40, $update->new_progress);
        $this->assertSame($this->member->id, $update->user_id);

        TaskService::applyUpdate($task, $this->member, null, 100);
        $task->refresh();
        $this->assertSame(TaskStatus::Completed, $task->status);
        $this->assertNotNull($task->completed_at);

        // Explicit status wins and progress is normalised.
        TaskService::applyUpdate($task, $this->member, 'in_progress', 100);
        $this->assertSame(99, $task->fresh()->progress);
        TaskService::applyUpdate($task, $this->member, 'pending');
        $this->assertSame(0, $task->fresh()->progress);

        $this->assertNull(TaskService::applyUpdate($task, $this->member, 'pending', 0, ''));
    }

    public function test_task_updates_are_immutable(): void
    {
        $task = TaskService::create(['project_id' => $this->project->id, 'title' => 'Immutable'], $this->owner);
        $update = $task->updates()->first();

        $this->expectException(LogicException::class);
        $update->update(['remark' => 'tampered']);
    }

    public function test_subtask_inherits_project_and_parent_rolls_up(): void
    {
        $other = ProjectService::create(['name' => 'Other'], $this->owner);
        $parent = TaskService::create(['project_id' => $this->project->id, 'title' => 'Launch'], $this->owner);
        $a = TaskService::create(['project_id' => $other->id, 'parent_id' => $parent->id, 'title' => 'A'], $this->owner);
        $b = TaskService::create(['parent_id' => $parent->id, 'title' => 'B'], $this->owner);

        $this->assertSame($this->project->id, $a->project_id, 'subtask must inherit parent project');

        TaskService::applyUpdate($a, $this->owner, null, 100);
        $parent->refresh();
        $this->assertSame(50, $parent->progress);
        $this->assertSame(TaskStatus::InProgress, $parent->status);

        TaskService::applyUpdate($b, $this->owner, 'completed');
        $parent->refresh();
        $this->assertSame(100, $parent->progress);
        $this->assertSame(TaskStatus::Completed, $parent->status);
        $this->assertSame(100, $this->project->fresh()->progress);

        $this->expectException(ValidationException::class);
        TaskService::create(['parent_id' => $a->id, 'title' => 'Too deep'], $this->owner);
    }

    public function test_overdue_tasks_are_auto_delayed_and_cleared_when_rescheduled(): void
    {
        $task = TaskService::create(['project_id' => $this->project->id, 'title' => 'Late', 'assignee_id' => $this->member->id, 'progress' => 30], $this->owner);
        $task->forceFill(['due_date' => now()->subDays(2)->toDateString()])->save();

        $result = DeadlineService::markOverdueTasksDelayed();
        $task->refresh();
        $this->assertSame(1, $result);
        $this->assertSame(TaskStatus::Delayed, $task->status);
        $this->assertSame(TaskStatus::InProgress, $task->status_before_delay);
        $this->assertTrue(TaskUpdate::query()->where('task_id', $task->id)->where('type', TaskUpdateType::AutoDelayed->value)->whereNull('user_id')->exists());
        $this->assertTrue(Notification::query()->where('user_id', $this->member->id)->where('type', NotificationType::TaskDelayed->value)->exists());

        // Choosing In Progress while still overdue keeps it Delayed.
        TaskService::applyUpdate($task, $this->member, 'in_progress', 45);
        $this->assertSame(TaskStatus::Delayed, $task->fresh()->status);

        TaskService::updateDetails($task->fresh(), ['due_date' => now()->addWeek()->toDateString()], $this->owner);
        $task->refresh();
        $this->assertSame(TaskStatus::InProgress, $task->status);
        $this->assertSame(45, $task->progress);
    }

    public function test_deadline_reminders_are_sent_once_per_due_date(): void
    {
        TaskService::create(['project_id' => $this->project->id, 'title' => 'Soon', 'assignee_id' => $this->member->id, 'due_date' => now()->addDay()->toDateString()], $this->owner);

        $this->assertSame(1, DeadlineService::sendDeadlineReminders());
        $this->assertSame(0, DeadlineService::sendDeadlineReminders());
    }

    public function test_project_health_reflects_delays(): void
    {
        $t1 = TaskService::create(['project_id' => $this->project->id, 'title' => 'One'], $this->owner);
        TaskService::create(['project_id' => $this->project->id, 'title' => 'Two'], $this->owner);
        TaskService::create(['project_id' => $this->project->id, 'title' => 'Three'], $this->owner);
        TaskService::create(['project_id' => $this->project->id, 'title' => 'Four'], $this->owner);
        TaskService::create(['project_id' => $this->project->id, 'title' => 'Five'], $this->owner);
        $this->assertSame(ProjectHealth::OnTrack, ProjectHealthService::refresh($this->project->fresh())->health);

        $t1->forceFill(['due_date' => now()->subDay()->toDateString()])->save();
        DeadlineService::markOverdueTasksDelayed();
        $this->assertSame(ProjectHealth::AtRisk, $this->project->fresh()->health);

        Task::query()->where('project_id', $this->project->id)->where('id', '!=', $t1->id)->limit(1)->get()
            ->each(fn ($t) => $t->forceFill(['due_date' => now()->subDay()->toDateString()])->save());
        DeadlineService::markOverdueTasksDelayed();
        $this->assertSame(ProjectHealth::Delayed, ProjectHealthService::refresh($this->project->fresh())->health);
    }

    public function test_mentions_notify_only_users_who_can_view_the_task(): void
    {
        $outsider = $this->regularUser(['name' => 'Olga Outsider']);
        $task = TaskService::create(['project_id' => $this->project->id, 'title' => 'Mention me', 'assignee_id' => $this->member->id], $this->owner);

        TaskService::applyUpdate($task, $this->owner, null, null, "Hey @{$this->member->username} and @{$outsider->username}");

        $this->assertTrue(Notification::query()->where('user_id', $this->member->id)->where('type', NotificationType::Mentioned->value)->exists());
        $this->assertFalse(Notification::query()->where('user_id', $outsider->id)->where('type', NotificationType::Mentioned->value)->exists());
    }
}

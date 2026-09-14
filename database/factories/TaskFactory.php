<?php

namespace Database\Factories;

use App\Enums\Priority;
use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Note: factories bypass TaskService (no history/notifications). Use TaskService::create in tests
 * that exercise business rules.
 *
 * @extends Factory<Task>
 */
class TaskFactory extends Factory
{
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'parent_id' => null,
            'title' => rtrim(fake()->sentence(fake()->numberBetween(3, 6)), '.'),
            'description' => fake()->optional()->paragraph(),
            'status' => TaskStatus::Pending,
            'priority' => fake()->randomElement(Priority::cases()),
            'progress' => 0,
            'assignee_id' => null,
            'created_by' => fn (array $attrs) => Project::query()->find($attrs['project_id'])?->owner_id ?? User::factory(),
            'start_date' => now()->subDays(2)->toDateString(),
            'due_date' => now()->addDays(fake()->numberBetween(5, 20))->toDateString(),
        ];
    }

    public function forProject(Project $project): static
    {
        return $this->state(fn () => ['project_id' => $project->id, 'created_by' => $project->owner_id]);
    }

    public function assignedTo(User $user): static
    {
        return $this->state(fn () => ['assignee_id' => $user->id]);
    }

    public function subtaskOf(Task $parent): static
    {
        return $this->state(fn () => ['project_id' => $parent->project_id, 'parent_id' => $parent->id, 'created_by' => $parent->created_by]);
    }

    public function inProgress(int $progress = 50): static
    {
        return $this->state(fn () => ['status' => TaskStatus::InProgress, 'progress' => $progress]);
    }

    public function completed(): static
    {
        return $this->state(fn () => ['status' => TaskStatus::Completed, 'progress' => 100, 'completed_at' => now()]);
    }

    public function overdue(): static
    {
        return $this->state(fn () => ['start_date' => now()->subDays(10)->toDateString(), 'due_date' => now()->subDays(2)->toDateString()]);
    }
}

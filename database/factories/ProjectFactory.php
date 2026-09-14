<?php

namespace Database\Factories;

use App\Enums\Priority;
use App\Enums\ProjectMemberRole;
use App\Enums\ProjectStatus;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Note: factories bypass ProjectService. The owner is attached as a manager member automatically.
 *
 * @extends Factory<Project>
 */
class ProjectFactory extends Factory
{
    public function definition(): array
    {
        $start = fake()->dateTimeBetween('-30 days', '+5 days');

        return [
            'name' => fake()->unique()->catchPhrase(),
            'description' => fake()->paragraph(),
            'owner_id' => User::factory(),
            'created_by' => fn (array $attrs) => $attrs['owner_id'],
            'status' => ProjectStatus::Active,
            'priority' => fake()->randomElement(Priority::cases()),
            'color' => fake()->randomElement(Project::COLORS),
            'start_date' => $start,
            'due_date' => (clone $start)->modify('+'.fake()->numberBetween(20, 90).' days'),
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (Project $project) {
            $project->addMember($project->owner_id, null, ProjectMemberRole::Manager);
        });
    }

    public function ownedBy(User $user): static
    {
        return $this->state(fn () => ['owner_id' => $user->id, 'created_by' => $user->id]);
    }
}

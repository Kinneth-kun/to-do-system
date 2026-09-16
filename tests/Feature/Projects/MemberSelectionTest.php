<?php

namespace Tests\Feature\Projects;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\ProjectService;
use App\Services\TaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Project membership is chosen, never inferred.
 */
class MemberSelectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_project_form_shows_a_searchable_member_picker(): void
    {
        $user = $this->regularUser();
        $colleague = $this->regularUser(['name' => 'Juriel Gulane']);

        $response = $this->actingAs($user)->get(route('projects.create'))->assertOk();

        $response->assertSee('Juriel Gulane')
            ->assertSee('member_ids[]', false)
            ->assertSee('memberPicker', false)
            ->assertSee('type="checkbox"', false)
            ->assertDontSee('Hold Ctrl/Cmd');             // the old multi-select is gone

        // You are the owner, so you are never listed as someone to add.
        $this->assertStringNotContainsString(
            'value="'.$user->id.'"',
            $response->getContent(),
            'the creator should not appear in their own member list'
        );
        $this->assertStringContainsString('value="'.$colleague->id.'"', $response->getContent());
    }

    public function test_members_are_optional(): void
    {
        $user = $this->regularUser();

        $this->actingAs($user)->post(route('projects.store'), ['name' => 'Solo Project'])
            ->assertSessionHasNoErrors();

        $project = Project::query()->sole();
        $this->assertSame([$user->id], $project->members->pluck('id')->all(), 'only the owner should be a member');
    }

    public function test_selected_members_are_added_and_notified(): void
    {
        $user = $this->regularUser();
        $picked = $this->regularUser();
        $notPicked = $this->regularUser();

        $this->actingAs($user)->post(route('projects.store'), [
            'name' => 'Website',
            'member_ids' => [$picked->id],
        ])->assertSessionHasNoErrors();

        $project = Project::query()->sole();
        $this->assertTrue($project->isMember($picked));
        $this->assertFalse($project->isMember($notPicked));
        $this->assertDatabaseHas('notifications', ['user_id' => $picked->id, 'type' => 'project_member_added']);
    }

    public function test_assigning_a_task_warns_instead_of_enrolling_the_person(): void
    {
        $owner = $this->regularUser();
        $outsider = $this->regularUser(['name' => 'Outside Olly']);
        $project = ProjectService::create(['name' => 'Fit-out'], $owner);

        $this->actingAs($owner)->post(route('tasks.store'), [
            'project_id' => $project->id,
            'title' => 'Order signage',
            'priority' => 'medium',
            'assignee_id' => $outsider->id,
        ])->assertSessionHas('warning', fn (string $warning) => str_contains($warning, 'Outside Olly')
            && str_contains($warning, 'not a member'));

        $this->assertFalse($project->fresh()->isMember($outsider));
    }

    public function test_no_warning_when_the_assignee_is_already_on_the_team(): void
    {
        $owner = $this->regularUser();
        $member = $this->regularUser();
        $project = ProjectService::create(['name' => 'Fit-out', 'member_ids' => [$member->id]], $owner);

        $this->actingAs($owner)->post(route('tasks.store'), [
            'project_id' => $project->id,
            'title' => 'Order signage',
            'priority' => 'medium',
            'assignee_id' => $member->id,
        ])->assertSessionMissing('warning');
    }

    public function test_an_assignee_who_is_not_a_member_keeps_access_to_their_task(): void
    {
        $owner = $this->regularUser();
        $outsider = $this->regularUser();
        $project = ProjectService::create(['name' => 'Fit-out'], $owner);
        $task = TaskService::create([
            'project_id' => $project->id,
            'title' => 'Order signage',
            'assignee_id' => $outsider->id,
        ], $owner);

        // Sees and updates the task they own...
        $this->actingAs($outsider)->get(route('tasks.show', $task))->assertOk();
        $this->actingAs($outsider)->post(route('tasks.updates.store', $task), ['progress' => 40])->assertRedirect();
        $this->assertSame(40, $task->fresh()->progress);

        // ...but not the rest of the project.
        $this->actingAs($outsider)->get(route('projects.show', $project))->assertForbidden();
        $this->assertFalse(Task::query()->visibleTo($outsider->fresh())->where('id', '!=', $task->id)->exists());
    }

    public function test_owner_can_still_add_members_explicitly_afterwards(): void
    {
        $owner = $this->regularUser();
        $person = $this->regularUser();
        $project = ProjectService::create(['name' => 'Fit-out'], $owner);

        $this->actingAs($owner)->post(route('projects.members.store', $project), [
            'user_id' => $person->id,
            'role' => 'member',
        ])->assertRedirect();

        $this->assertTrue($project->fresh()->isMember($person));
    }
}

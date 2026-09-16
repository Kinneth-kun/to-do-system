<?php

namespace Tests\Feature\Projects;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Creating a project from inside the task form, so a user with no projects is never stuck.
 */
class InlineProjectCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_task_form_prompts_to_create_a_project_when_there_are_none(): void
    {
        $user = $this->regularUser();

        $this->actingAs($user)->get(route('tasks.create'))
            ->assertOk()
            ->assertSee('Create a project first')
            ->assertSee('New project');
    }

    public function test_task_form_offers_inline_creation_alongside_existing_projects(): void
    {
        $user = $this->regularUser();
        Project::factory()->ownedBy($user)->create(['name' => 'Existing Project']);

        $this->actingAs($user)->get(route('tasks.create'))
            ->assertOk()
            ->assertSee('Existing Project')
            ->assertSee('Create a new project')          // the + button
            ->assertSee('projectPicker', false);          // select is wired for live insertion
    }

    public function test_project_can_be_created_as_json_and_comes_back_for_the_picker(): void
    {
        $user = $this->regularUser();

        $response = $this->actingAs($user)
            ->postJson(route('projects.store'), ['name' => 'Tenant Move-In 2026']);

        $response->assertCreated()->assertJsonStructure(['ok', 'project' => ['id', 'name', 'color', 'url']]);

        $project = Project::query()->sole();
        $this->assertSame('Tenant Move-In 2026', $project->name);
        $this->assertSame($user->id, $project->owner_id);
        $this->assertTrue($project->isMember($user), 'creator should be a member');
        $this->assertSame($project->id, $response->json('project.id'));
    }

    public function test_only_a_name_is_required_for_the_inline_create(): void
    {
        $user = $this->regularUser();

        $this->actingAs($user)->postJson(route('projects.store'), ['name' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');

        // No status/priority/colour supplied — defaults are filled in by the service.
        $this->actingAs($user)->postJson(route('projects.store'), ['name' => 'Minimal'])->assertCreated();

        $project = Project::query()->sole();
        $this->assertSame('active', $project->status->value);
        $this->assertSame('medium', $project->priority->value);
        $this->assertNotEmpty($project->color);
    }

    public function test_without_javascript_the_form_returns_to_the_task_page_with_the_project_selected(): void
    {
        $user = $this->regularUser();

        $this->actingAs($user)
            ->post(route('projects.store'), ['name' => 'Fallback Project', 'return_to' => '/tasks/create'])
            ->assertRedirect('/tasks/create?project_id='.Project::query()->sole()->id)
            ->assertSessionHas('success');
    }

    public function test_return_to_cannot_be_used_as_an_open_redirect(): void
    {
        $user = $this->regularUser();

        foreach (['https://evil.example.com/steal', '//evil.example.com', 'javascript:alert(1)'] as $hostile) {
            $response = $this->actingAs($user)
                ->post(route('projects.store'), ['name' => 'Redirect '.md5($hostile), 'return_to' => $hostile]);

            $response->assertRedirect(route('projects.show', Project::query()->latest('id')->first()));
        }
    }

    public function test_the_created_project_can_immediately_receive_a_task(): void
    {
        $user = $this->regularUser();

        $projectId = $this->actingAs($user)
            ->postJson(route('projects.store'), ['name' => 'Fresh Project'])
            ->json('project.id');

        $this->actingAs($user)->post(route('tasks.store'), [
            'project_id' => $projectId,
            'title' => 'First task in the new project',
            'priority' => 'medium',
        ])->assertRedirect();

        $task = Task::query()->sole();
        $this->assertSame($projectId, $task->project_id);
        $this->assertSame('First task in the new project', $task->title);
    }

    public function test_quick_create_modal_exposes_the_new_project_button(): void
    {
        $user = $this->regularUser();

        $this->actingAs($user)->get(route('tasks.index'))
            ->assertOk()
            ->assertSee('New project')
            ->assertSee("open-modal', 'new-project", false);
    }

    public function test_quick_create_errors_stay_in_their_own_bag(): void
    {
        $user = $this->regularUser();

        $response = $this->actingAs($user)
            ->from(route('tasks.index'))
            ->post(route('quick-create'), ['title' => '', 'project_id' => '']);

        $response->assertRedirect(route('tasks.index'));
        $this->assertTrue(session('errors')->getBag('quickCreate')->has('title'));
        $this->assertFalse(session('errors')->getBag('default')->has('title'));
    }
}

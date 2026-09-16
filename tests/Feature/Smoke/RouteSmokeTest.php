<?php

namespace Tests\Feature\Smoke;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\ProjectService;
use App\Services\TaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every GET page must render for an administrator and for a regular project member.
 * This catches Blade compile errors, missing view variables and broken route names.
 */
class RouteSmokeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $member;
    private Project $project;
    private Task $task;
    private Task $subtask;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->admin();
        $this->member = $this->regularUser();
        $this->project = ProjectService::create([
            'name' => 'Smoke Project',
            'start_date' => now()->subWeek()->toDateString(),
            'due_date' => now()->addWeeks(3)->toDateString(),
            'member_ids' => [$this->member->id],
        ], $this->admin);
        $this->task = TaskService::create([
            'project_id' => $this->project->id,
            'title' => 'Smoke Task',
            'assignee_id' => $this->member->id,
            'due_date' => now()->addDays(2)->toDateString(),
        ], $this->admin);
        $this->subtask = TaskService::create([
            'parent_id' => $this->task->id,
            'title' => 'Smoke Subtask',
            'assignee_id' => $this->member->id,
        ], $this->admin);
        TaskService::applyUpdate($this->task, $this->member, null, 40, 'Making progress');
    }

    public static function adminRoutes(): array
    {
        return [
            'executive' => ['admin.executive'],
            'meeting' => ['admin.meeting'],
            'users index' => ['admin.users.index'],
            'users create' => ['admin.users.create'],
            'activity logs' => ['admin.activity-logs.index'],
            'settings' => ['admin.settings.edit'],
        ];
    }

    public static function sharedRoutes(): array
    {
        return [
            'dashboard' => ['dashboard'],
            'tasks index' => ['tasks.index'],
            'tasks create' => ['tasks.create'],
            'projects index' => ['projects.index'],
            'projects create' => ['projects.create'],
            'calendar' => ['calendar'],
            'notifications' => ['notifications.index'],
            'profile' => ['profile.edit'],
        ];
    }

    #[DataProvider('sharedRoutes')]
    public function test_pages_render_for_admin(string $route): void
    {
        $this->actingAs($this->admin)->get(route($route))->assertOk();
    }

    #[DataProvider('sharedRoutes')]
    public function test_pages_render_for_member(string $route): void
    {
        $this->actingAs($this->member)->get(route($route))->assertOk();
    }

    #[DataProvider('adminRoutes')]
    public function test_admin_pages_render(string $route): void
    {
        $this->actingAs($this->admin)->get(route($route))->assertOk();
    }

    #[DataProvider('adminRoutes')]
    public function test_admin_pages_forbidden_for_members(string $route): void
    {
        $this->actingAs($this->member)->get(route($route))->assertForbidden();
    }

    public function test_model_pages_render(): void
    {
        $this->actingAs($this->member)->get(route('projects.show', $this->project))->assertOk();
        $this->actingAs($this->member)->get(route('tasks.show', $this->task))->assertOk();
        $this->actingAs($this->member)->get(route('tasks.show', $this->subtask))->assertOk();
        $this->actingAs($this->member)->get(route('tasks.updates.index', $this->task))->assertOk();
        $this->actingAs($this->admin)->get(route('projects.edit', $this->project))->assertOk();
        $this->actingAs($this->admin)->get(route('tasks.edit', $this->task))->assertOk();
        $this->actingAs($this->admin)->get(route('admin.users.edit', $this->member))->assertOk();
    }

    public function test_calendar_views_render(): void
    {
        foreach (['month', 'week', 'day'] as $view) {
            $this->actingAs($this->member)->get(route('calendar', ['view' => $view]))->assertOk();
        }
    }

    public function test_search_and_json_endpoints(): void
    {
        $this->actingAs($this->member)->get(route('search', ['q' => 'Smoke']))->assertOk()->assertSee('Smoke Task');

        $this->actingAs($this->member)->getJson(route('search.suggest', ['q' => 'Smoke']))
            ->assertOk()
            ->assertJsonStructure(['query', 'groups' => [['key', 'label', 'items' => [['id', 'title', 'url']]]]]);

        $this->actingAs($this->member)->getJson(route('lookup.users', ['q' => 'a']))
            ->assertOk()
            ->assertJsonStructure(['data' => [['id', 'name', 'username']]]);

        $this->actingAs($this->member)->getJson(route('notifications.recent'))
            ->assertOk()
            ->assertJsonStructure(['unread_count', 'data']);
    }

    public function test_login_page_renders_and_guests_are_redirected(): void
    {
        $this->get(route('login'))->assertOk();
        $this->get(route('dashboard'))->assertRedirect(route('login'));
    }
}

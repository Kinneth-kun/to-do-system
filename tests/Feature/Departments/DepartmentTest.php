<?php

namespace Tests\Feature\Departments;

use App\Enums\Department;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Services\ProjectService;
use App\Services\TaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DepartmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_department_is_cast_to_the_enum(): void
    {
        $user = User::factory()->inDepartment(Department::Leasing)->create();

        $this->assertSame(Department::Leasing, $user->fresh()->department);
        $this->assertSame('Leasing', $user->department->label());
        $this->assertSame('LSG', $user->department->code());
    }

    public function test_the_seven_official_departments_are_offered(): void
    {
        $this->assertSame([
            'Human Resources',
            'Leasing',
            'Marketing',
            'Security',
            'Operations',
            'Information Technology',
            'Accounting',
        ], array_values(Department::options()));
    }

    public function test_free_text_departments_map_onto_the_official_list(): void
    {
        $this->assertSame(Department::HumanResources, Department::fromLabel('People'));
        $this->assertSame(Department::HumanResources, Department::fromLabel('HR'));
        $this->assertSame(Department::InformationTechnology, Department::fromLabel('Engineering'));
        $this->assertSame(Department::Accounting, Department::fromLabel('Finance'));
        $this->assertSame(Department::Marketing, Department::fromLabel('Design'));
        $this->assertSame(Department::Operations, Department::fromLabel('Management'));
        $this->assertSame(Department::Security, Department::fromLabel('Safety & Security'));
        $this->assertSame(Department::Leasing, Department::fromLabel('leasing'));
        $this->assertNull(Department::fromLabel(null));
    }

    public function test_admin_must_choose_a_valid_department_when_creating_a_user(): void
    {
        $admin = $this->admin();

        $payload = [
            'name' => 'New Person',
            'username' => 'new.person',
            'email' => 'new.person@example.com',
            'job_title' => 'Analyst',
            'avatar_color' => 'sky',
            'role_id' => Role::idFor(Role::USER),
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ];

        // Missing
        $this->actingAs($admin)->post(route('admin.users.store'), $payload)->assertSessionHasErrors('department');
        // Not one of the seven
        $this->actingAs($admin)->post(route('admin.users.store'), $payload + ['department' => 'Engineering'])->assertSessionHasErrors('department');

        // Valid
        $this->actingAs($admin)
            ->post(route('admin.users.store'), array_merge($payload, ['department' => Department::Security->value]))
            ->assertSessionHasNoErrors();

        $this->assertSame(Department::Security, User::query()->where('email', 'new.person@example.com')->sole()->department);
    }

    public function test_user_can_set_their_own_department_from_the_profile(): void
    {
        $user = $this->regularUser();

        $this->actingAs($user)->put(route('profile.update'), [
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'job_title' => $user->job_title,
            'department' => Department::Accounting->value,
            'avatar_color' => $user->avatar_color,
        ])->assertSessionHasNoErrors();

        $this->assertSame(Department::Accounting, $user->fresh()->department);
    }

    public function test_tasks_can_be_filtered_by_the_assignee_department(): void
    {
        $owner = $this->admin();
        $itPerson = User::factory()->inDepartment(Department::InformationTechnology)->create();
        $hrPerson = User::factory()->inDepartment(Department::HumanResources)->create();
        $project = ProjectService::create(['name' => 'Cross-department project'], $owner);

        $itTask = TaskService::create(['project_id' => $project->id, 'title' => 'Replace the firewall', 'assignee_id' => $itPerson->id], $owner);
        $hrTask = TaskService::create(['project_id' => $project->id, 'title' => 'Update the staff handbook', 'assignee_id' => $hrPerson->id], $owner);

        // Model scope
        $this->assertEqualsCanonicalizing(
            [$itTask->id],
            Task::query()->forDepartment(Department::InformationTechnology)->pluck('id')->all()
        );

        // My Tasks page
        $this->actingAs($owner)
            ->get(route('tasks.index', ['department' => Department::InformationTechnology->value]))
            ->assertOk()
            ->assertSee('Replace the firewall')
            ->assertDontSee('Update the staff handbook');

        $this->assertNotNull($hrTask->assignee_id);
    }

    public function test_admin_can_filter_users_by_department(): void
    {
        $admin = $this->admin();
        User::factory()->inDepartment(Department::Leasing)->create(['name' => 'Leasing Lee']);
        User::factory()->inDepartment(Department::Marketing)->create(['name' => 'Marketing Mo']);

        $this->actingAs($admin)
            ->get(route('admin.users.index', ['department' => Department::Leasing->value]))
            ->assertOk()
            ->assertSee('Leasing Lee')
            ->assertDontSee('Marketing Mo');
    }

    public function test_migration_normalized_the_existing_free_text_values(): void
    {
        // Simulate a pre-migration row and re-run the mapping the migration performs.
        $user = User::factory()->create();
        DB::table('users')->where('id', $user->id)->update(['department' => 'Engineering']);

        DB::table('users')->where('id', $user->id)->update([
            'department' => Department::fromLabel(DB::table('users')->where('id', $user->id)->value('department'))?->value,
        ]);

        $this->assertSame(Department::InformationTechnology, $user->fresh()->department);
    }
}

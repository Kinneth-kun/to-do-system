<?php

namespace Tests\Feature\AdminUsers;

use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_regular_users_cannot_access_user_management(): void
    {
        $this->actingAs($this->regularUser());

        $this->get(route('admin.users.index'))->assertForbidden();
        $this->get(route('admin.users.create'))->assertForbidden();
    }

    public function test_admin_can_list_users_with_filters_and_pagination(): void
    {
        $admin = $this->admin();
        UserControllerTest::createUsers(21);
        $this->actingAs($admin);

        $this->get(route('admin.users.index', ['q' => 'Person', 'status' => 'active']))
            ->assertOk()
            ->assertViewIs('admin.users.index')
            ->assertViewHas('users', fn ($users) => $users->total() === 21 && $users->perPage() === 20);
    }

    public function test_admin_can_create_user_and_activity_is_logged(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin);

        $this->post(route('admin.users.store'), [
            'name' => 'New Teammate',
            'username' => 'new.teammate',
            'email' => 'new.teammate@example.com',
            'job_title' => 'Coordinator',
            'department' => 'Operations',
            'avatar_color' => 'sky',
            'role_id' => Role::idFor(Role::USER),
            'password' => 'secure-password1',
            'password_confirmation' => 'secure-password1',
        ])->assertRedirect(route('admin.users.index'))->assertSessionHas('success');

        $user = \App\Models\User::query()->where('email', 'new.teammate@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('secure-password1', $user->password));
        $this->assertDatabaseHas('activity_logs', ['action' => 'user.created', 'subject_id' => $user->id]);
    }

    public function test_admin_can_update_role_and_log_role_change(): void
    {
        $admin = $this->admin();
        $user = $this->regularUser();
        $this->actingAs($admin);

        $this->put(route('admin.users.update', $user), [
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'avatar_color' => $user->avatar_color,
            'role_id' => Role::idFor(Role::ADMIN),
        ])->assertRedirect(route('admin.users.edit', $user))->assertSessionHas('success');

        $this->assertSame(Role::ADMIN, $user->fresh()->role->name);
        $this->assertDatabaseHas('activity_logs', ['action' => 'user.role_changed', 'subject_id' => $user->id]);
    }

    public function test_admin_cannot_deactivate_themselves_or_remove_last_admin(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin);

        $this->post(route('admin.users.toggle-active', $admin))->assertRedirect()->assertSessionHas('error');
        $this->put(route('admin.users.update', $admin), [
            'name' => $admin->name,
            'username' => $admin->username,
            'email' => $admin->email,
            'avatar_color' => $admin->avatar_color,
            'role_id' => Role::idFor(Role::USER),
        ])->assertRedirect()->assertSessionHas('error');
        $this->assertTrue($admin->fresh()->is_active);
        $this->assertTrue($admin->fresh()->isAdmin());
    }

    public function test_admin_can_toggle_unlock_and_reset_a_user(): void
    {
        $admin = $this->admin();
        $user = $this->regularUser(['locked_until' => now()->addHour(), 'failed_login_attempts' => 4]);
        $this->actingAs($admin);

        $this->post(route('admin.users.toggle-active', $user))->assertRedirect()->assertSessionHas('success');
        $this->assertFalse($user->fresh()->is_active);

        $this->post(route('admin.users.unlock', $user))->assertRedirect()->assertSessionHas('success');
        $this->assertNull($user->fresh()->locked_until);
        $this->assertSame(0, $user->fresh()->failed_login_attempts);

        $this->put(route('admin.users.password', $user), [
            'password' => 'reset-password1',
            'password_confirmation' => 'reset-password1',
        ])->assertRedirect()->assertSessionHas('success');
        $this->assertTrue(Hash::check('reset-password1', $user->fresh()->password));
        $this->assertDatabaseHas('activity_logs', ['action' => 'user.password_reset', 'subject_id' => $user->id]);
    }

    private static function createUsers(int $count): void
    {
        for ($i = 1; $i <= $count; $i++) {
            \App\Models\User::factory()->create(['name' => 'Person '.$i, 'email' => 'person'.$i.'@example.com']);
        }
    }
}
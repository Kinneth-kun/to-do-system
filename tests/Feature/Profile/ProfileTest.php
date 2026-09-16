<?php

namespace Tests\Feature\Profile;

use App\Models\ActivityLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_view_and_update_their_profile(): void
    {
        $user = $this->regularUser(['name' => 'Original Name']);
        $this->actingAs($user);

        $this->get(route('profile.edit'))->assertOk()->assertViewIs('profile.edit');
        $response = $this->put(route('profile.update'), [
            'name' => 'Updated Name',
            'username' => 'updated.name',
            'email' => 'updated@example.com',
            'job_title' => 'Lead Planner',
            'department' => 'Operations',
            'avatar_color' => 'teal',
        ]);

        $response->assertRedirect()->assertSessionHas('success');
        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Updated Name', 'username' => 'updated.name']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'profile.updated', 'subject_id' => $user->id]);
    }

    public function test_profile_update_rejects_duplicate_email(): void
    {
        $user = $this->regularUser();
        $other = $this->regularUser();
        $this->actingAs($user);

        $response = $this->from(route('profile.edit'))->put(route('profile.update'), [
            'name' => $user->name,
            'username' => $user->username,
            'email' => $other->email,
            'avatar_color' => 'indigo',
        ]);

        $response->assertRedirect(route('profile.edit'))->assertSessionHasErrors('email');
    }

    public function test_user_must_provide_current_and_confirmed_password(): void
    {
        $user = $this->regularUser();
        $this->actingAs($user);

        $this->from(route('profile.edit'))->put(route('profile.password'), [
            'current_password' => 'wrong-password',
            'password' => 'new-password1',
            'password_confirmation' => 'new-password1',
        ])->assertRedirect(route('profile.edit'))->assertSessionHasErrors('current_password');

        $this->from(route('profile.edit'))->put(route('profile.password'), [
            'current_password' => 'password',
            'password' => 'new-password1',
            'password_confirmation' => 'different-password1',
        ])->assertRedirect(route('profile.edit'))->assertSessionHasErrors('password');
    }

    public function test_user_can_change_password_and_activity_is_logged(): void
    {
        $user = $this->regularUser();
        $this->actingAs($user);

        $this->put(route('profile.password'), [
            'current_password' => 'password',
            'password' => 'new-password1',
            'password_confirmation' => 'new-password1',
        ])->assertRedirect()->assertSessionHas('success');

        $this->assertTrue(Hash::check('new-password1', $user->fresh()->password));
        $this->assertDatabaseHas('activity_logs', ['action' => 'profile.password_changed', 'subject_id' => $user->id]);
    }
}
<?php

namespace Tests\Feature\Security;

use App\Models\User;
use App\Services\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Brute-force protection. The columns existed and the admin screen showed a "Locked" filter and
 * an Unlock button, but nothing ever wrote them — these tests pin the behaviour down.
 */
class LoginLockoutTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'CorrectHorse9';

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('login');   // the per-IP throttle is a separate layer
    }

    private function person(array $attributes = []): User
    {
        return $this->regularUser(array_merge([
            'email' => 'target@example.com',
            'password' => Hash::make(self::PASSWORD),
        ], $attributes));
    }

    private function attempt(string $password, string $login = 'target@example.com')
    {
        return $this->post(route('login.store'), ['login' => $login, 'password' => $password]);
    }

    public function test_failed_attempts_are_counted(): void
    {
        $user = $this->person();

        $this->attempt('wrong')->assertSessionHasErrors('login');
        $this->assertSame(1, $user->fresh()->failed_login_attempts);

        $this->attempt('wrong-again')->assertSessionHasErrors('login');
        $this->assertSame(2, $user->fresh()->failed_login_attempts);
    }

    public function test_the_account_locks_after_the_configured_number_of_failures(): void
    {
        Settings::set(['security.max_login_attempts' => 3, 'security.lockout_minutes' => 15]);
        $user = $this->person();

        foreach (range(1, 3) as $i) {
            $this->attempt('wrong')->assertSessionHasErrors('login');
        }

        $user->refresh();
        $this->assertTrue($user->isLocked(), 'the account should be locked');
        $this->assertEqualsWithDelta(15, now()->diffInMinutes($user->locked_until), 1);
        // Nobody is signed in during a failed attempt, so the account is the log's subject
        // and the actor stays null — the attempt may not have been the real owner.
        $this->assertDatabaseHas('activity_logs', ['action' => 'auth.locked', 'subject_type' => 'user', 'subject_id' => $user->id, 'user_id' => null]);
    }

    public function test_a_locked_account_is_refused_even_with_the_right_password(): void
    {
        Settings::set(['security.max_login_attempts' => 3]);
        $user = $this->person();
        $user->forceFill(['locked_until' => now()->addMinutes(10)])->save();

        $this->attempt(self::PASSWORD)->assertSessionHasErrors('login');
        $this->assertGuest();
    }

    public function test_the_lock_expires_on_its_own(): void
    {
        $user = $this->person();
        $user->forceFill(['locked_until' => now()->subMinute()])->save();

        $this->attempt(self::PASSWORD)->assertRedirect(route('dashboard'));
        $this->assertAuthenticatedAs($user);
    }

    public function test_a_successful_sign_in_clears_the_counter(): void
    {
        $user = $this->person();
        $this->attempt('wrong');
        $this->assertSame(1, $user->fresh()->failed_login_attempts);

        $this->attempt(self::PASSWORD)->assertRedirect(route('dashboard'));

        $user->refresh();
        $this->assertSame(0, $user->failed_login_attempts);
        $this->assertNull($user->locked_until);
        $this->assertNotNull($user->last_login_at);
    }

    public function test_an_admin_can_unlock_the_account(): void
    {
        $admin = $this->admin();
        $user = $this->person();
        $user->forceFill(['locked_until' => now()->addHour(), 'failed_login_attempts' => 9])->save();

        $this->actingAs($admin)->post(route('admin.users.unlock', $user))->assertRedirect();

        $user->refresh();
        $this->assertFalse($user->isLocked());
        $this->assertSame(0, $user->failed_login_attempts);
    }

    public function test_login_does_not_reveal_which_accounts_exist(): void
    {
        $this->person();

        $known = $this->attempt('wrong');
        $unknown = $this->attempt('wrong', 'nobody@example.com');

        $this->assertSame(
            session('errors')?->first('login'),
            $unknown->getSession()->get('errors')?->first('login'),
            'a wrong password and an unknown account must read identically'
        );
        $this->assertStringContainsString('do not match our records', $known->getSession()->get('errors')->first('login'));
    }

    public function test_a_deactivated_account_cannot_sign_in(): void
    {
        $user = $this->person(['is_active' => false]);

        $this->attempt(self::PASSWORD)->assertSessionHasErrors('login');
        $this->assertGuest();
        $this->assertDatabaseHas('activity_logs', ['action' => 'auth.failed', 'subject_type' => 'user', 'subject_id' => $user->id]);
    }
}

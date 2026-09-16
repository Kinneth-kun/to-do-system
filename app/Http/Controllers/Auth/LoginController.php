<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\Settings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class LoginController extends Controller
{
    public function create(): View
    {
        return view('auth.login');
    }

    /**
     * Sign in with an email address or username.
     *
     * Brute-force protection is two-layered: a per-IP throttle on the route, and a per-account
     * lockout here — after `security.max_login_attempts` consecutive failures the account is
     * locked for `security.lockout_minutes` (admins can clear it from the Users screen).
     *
     * The specific "locked" and "deactivated" messages are only shown to someone who supplied the
     * correct password. Everyone else gets one generic message, so login cannot be used to work
     * out which email addresses or usernames exist.
     */
    public function store(Request $request): RedirectResponse
    {
        $credentials = $request->validate([
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $login = $credentials['login'];
        $user = User::query()
            ->where(fn ($query) => $query->where('email', $login)->orWhere('username', $login))
            ->first();

        $passwordMatches = $user !== null && Hash::check($credentials['password'], $user->password);

        // Locked accounts are refused even when the password is right.
        if ($user && $user->isLocked()) {
            ActivityLogger::log('auth.locked', 'Sign-in attempt on locked account '.$user->name, $user, [
                'locked_until' => $user->locked_until?->toDateTimeString(),
            ]);

            $this->fail($passwordMatches
                ? 'This account is locked for another '.max(1, (int) ceil(now()->diffInMinutes($user->locked_until, false))).' minutes. Ask an administrator to unlock it.'
                : null);
        }

        if (! $passwordMatches) {
            if ($user) {
                $this->registerFailure($user);
            }

            $this->fail();
        }

        if (! $user->is_active) {
            ActivityLogger::log('auth.failed', 'Sign-in attempt on deactivated account '.$user->name, $user);

            $this->fail('Your account has been deactivated. Please contact your administrator.');
        }

        Auth::login($user, (bool) ($credentials['remember'] ?? false));
        $request->session()->regenerate();

        $user->forceFill([
            'failed_login_attempts' => 0,
            'locked_until' => null,
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
        ])->save();

        ActivityLogger::log('auth.login', $user->name.' signed in', $user, [], $user);

        return redirect()->intended(route('dashboard'));
    }

    public function destroy(Request $request): RedirectResponse
    {
        $user = $request->user();
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if ($user) {
            ActivityLogger::log('auth.logout', $user->name.' signed out', $user, [], $user);
        }

        return redirect()->route('login')->with('status', 'You have been signed out.');
    }

    /** Count the failure and lock the account once it crosses the configured threshold. */
    private function registerFailure(User $user): void
    {
        $attempts = $user->failed_login_attempts + 1;
        $limit = max(1, Settings::int('security.max_login_attempts'));

        if ($attempts >= $limit) {
            $minutes = max(1, Settings::int('security.lockout_minutes'));
            $user->forceFill([
                'failed_login_attempts' => 0,
                'locked_until' => now()->addMinutes($minutes),
            ])->save();

            ActivityLogger::log('auth.locked', $user->name.' was locked out after '.$attempts.' failed attempts', $user, [
                'attempts' => $attempts,
                'minutes' => $minutes,
            ]);

            return;
        }

        $user->forceFill(['failed_login_attempts' => $attempts])->save();

        ActivityLogger::log('auth.failed', 'Failed sign-in attempt for '.$user->name, $user, [
            'attempts' => $attempts,
            'remaining' => $limit - $attempts,
        ]);
    }

    /** @throws ValidationException */
    private function fail(?string $message = null): never
    {
        throw ValidationException::withMessages([
            'login' => $message ?? 'These credentials do not match our records.',
        ]);
    }
}

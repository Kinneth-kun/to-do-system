<?php

namespace App\Providers;

use App\Models\Attachment;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\TaskUpdate;
use App\Models\User;
use App\Services\Settings;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Relation::enforceMorphMap([
            'user' => User::class,
            'project' => Project::class,
            'task' => Task::class,
            'task_comment' => TaskComment::class,
            'task_update' => TaskUpdate::class,
            'attachment' => Attachment::class,
        ]);

        // Administrators can do everything; policies apply to regular users.
        Gate::before(fn (User $user) => $user->isAdmin() ? true : null);
        Gate::define('admin', fn (User $user) => $user->isAdmin());

        Password::defaults(fn () => Password::min(8)->letters()->numbers());

        // Per-IP limiter for the login endpoint (in addition to per-account lockout).
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));
        // General limiter for JSON lookups (search suggest, user pickers).
        RateLimiter::for('lookup', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));

        View::composer('components.layouts.app', function ($view) {
            $user = Auth::user();
            $view->with([
                'appName' => Settings::string('general.app_name'),
                'unreadNotificationCount' => $user ? $user->unreadNotifications()->count() : 0,
            ]);
        });
        View::composer('components.layouts.guest', fn ($view) => $view->with('appName', Settings::string('general.app_name')));
    }
}

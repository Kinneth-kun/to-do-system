<?php

use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\ExecutiveDashboardController;
use App\Http\Controllers\Admin\MeetingController;
use App\Http\Controllers\Admin\SettingController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\AttachmentController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\LookupController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ProjectMemberController;
use App\Http\Controllers\QuickCreateController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\TaskCollaboratorController;
use App\Http\Controllers\TaskCommentController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TaskUpdateController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Guest
|--------------------------------------------------------------------------
*/
Route::middleware('guest')->group(function () {
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store'])->middleware('throttle:login')->name('login.store');
});

/*
|--------------------------------------------------------------------------
| Authenticated (all roles)
|--------------------------------------------------------------------------
*/
Route::middleware('auth')->group(function () {
    Route::post('/logout', [LoginController::class, 'destroy'])->name('logout');

    Route::get('/', DashboardController::class)->name('dashboard');

    // Profile
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::put('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::put('/profile/password', [ProfileController::class, 'updatePassword'])->name('profile.password');

    // Projects
    Route::resource('projects', ProjectController::class);
    Route::post('/projects/{project}/members', [ProjectMemberController::class, 'store'])->name('projects.members.store');
    Route::patch('/projects/{project}/members/{user}', [ProjectMemberController::class, 'update'])->name('projects.members.update');
    Route::delete('/projects/{project}/members/{user}', [ProjectMemberController::class, 'destroy'])->name('projects.members.destroy');

    // Tasks & subtasks. Create accepts ?project_id= and ?parent_id= to pre-fill.
    Route::get('/tasks', [TaskController::class, 'index'])->name('tasks.index');           // "My Tasks" with filters
    Route::get('/tasks/create', [TaskController::class, 'create'])->name('tasks.create');
    Route::post('/tasks', [TaskController::class, 'store'])->name('tasks.store');
    Route::get('/tasks/{task}', [TaskController::class, 'show'])->name('tasks.show');
    Route::get('/tasks/{task}/edit', [TaskController::class, 'edit'])->name('tasks.edit');
    Route::put('/tasks/{task}', [TaskController::class, 'update'])->name('tasks.update');
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy'])->name('tasks.destroy');

    // Quick status / progress / remark update (history is append-only)
    Route::post('/tasks/{task}/updates', [TaskUpdateController::class, 'store'])->name('tasks.updates.store');
    Route::get('/tasks/{task}/updates', [TaskUpdateController::class, 'index'])->name('tasks.updates.index');

    // Collaboration
    Route::post('/tasks/{task}/collaborators', [TaskCollaboratorController::class, 'store'])->name('tasks.collaborators.store');
    Route::delete('/tasks/{task}/collaborators/{user}', [TaskCollaboratorController::class, 'destroy'])->name('tasks.collaborators.destroy');
    Route::post('/tasks/{task}/comments', [TaskCommentController::class, 'store'])->name('tasks.comments.store');
    Route::delete('/comments/{comment}', [TaskCommentController::class, 'destroy'])->name('comments.destroy');
    Route::post('/tasks/{task}/attachments', [AttachmentController::class, 'store'])->name('tasks.attachments.store');
    Route::get('/attachments/{attachment}', [AttachmentController::class, 'show'])->name('attachments.show');
    Route::delete('/attachments/{attachment}', [AttachmentController::class, 'destroy'])->name('attachments.destroy');

    // Calendar: ?view=month|week|day&date=YYYY-MM-DD&project_id=&mine=1
    Route::get('/calendar', [CalendarController::class, 'index'])->name('calendar');

    // Notification center
    Route::get('/notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::get('/notifications/recent', [NotificationController::class, 'recent'])->name('notifications.recent'); // JSON for bell dropdown
    Route::get('/notifications/{notification}/open', [NotificationController::class, 'open'])->name('notifications.open');
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead'])->name('notifications.read');
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');

    // Global search & quick create
    Route::get('/search', [SearchController::class, 'index'])->name('search');
    Route::get('/search/suggest', [SearchController::class, 'suggest'])->middleware('throttle:lookup')->name('search.suggest'); // JSON
    Route::post('/quick-create', [QuickCreateController::class, 'store'])->name('quick-create');

    // JSON lookups for pickers (assignee, collaborators, @mentions). ?q=&project_id=
    Route::get('/lookup/users', [LookupController::class, 'users'])->middleware('throttle:lookup')->name('lookup.users');
    Route::get('/lookup/projects/{project}/parents', [LookupController::class, 'parentTasks'])->middleware('throttle:lookup')->name('lookup.parent-tasks');

    /*
    |----------------------------------------------------------------------
    | Administrator
    |----------------------------------------------------------------------
    */
    Route::middleware('admin')->prefix('admin')->name('admin.')->group(function () {
        Route::get('/executive', ExecutiveDashboardController::class)->name('executive');
        Route::get('/meeting', MeetingController::class)->name('meeting');

        Route::get('/users', [UserController::class, 'index'])->name('users.index');
        Route::get('/users/create', [UserController::class, 'create'])->name('users.create');
        Route::post('/users', [UserController::class, 'store'])->name('users.store');
        Route::get('/users/{user}/edit', [UserController::class, 'edit'])->name('users.edit');
        Route::put('/users/{user}', [UserController::class, 'update'])->name('users.update');
        Route::post('/users/{user}/toggle-active', [UserController::class, 'toggleActive'])->name('users.toggle-active');
        Route::post('/users/{user}/unlock', [UserController::class, 'unlock'])->name('users.unlock');
        Route::put('/users/{user}/password', [UserController::class, 'resetPassword'])->name('users.password');

        Route::get('/activity-logs', [ActivityLogController::class, 'index'])->name('activity-logs.index');

        Route::get('/settings', [SettingController::class, 'edit'])->name('settings.edit');
        Route::put('/settings', [SettingController::class, 'update'])->name('settings.update');
    });
});

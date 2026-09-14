# TaskFlow — Architecture & Build Contract

TaskFlow is a role-based Project & Task Management System (one Administrator role + regular users).
Stack: **Laravel 12 (PHP 8.2)** · **Blade + Tailwind CSS v4 + Alpine.js** · **SQLite** (MySQL-compatible migrations) · session auth.

Run locally:

```bash
composer install && npm install
php artisan migrate:fresh --seed     # admin@taskflow.test / password  (+ maria, james, aisha, daniel, sofia, liam, grace @taskflow.test)
npm run build                        # or: npm run dev
php artisan serve
```

---

## 1. Foundation (already built — DO NOT MODIFY unless you are the integrator)

| Area | Files |
|---|---|
| Schema | `database/migrations/*` — roles, users, projects, project_members, tasks, task_collaborators, task_updates, task_comments, attachments, notifications, activity_logs, settings |
| Enums | `app/Enums/` — `TaskStatus`, `Priority`, `ProjectStatus`, `ProjectHealth`, `ProjectMemberRole`, `TaskUpdateType`, `NotificationType` (all have `label()`, most have `color()` and `options()`) |
| Models | `app/Models/` — `Role`, `User`, `Project`, `Task`, `TaskUpdate` (immutable), `TaskComment`, `Attachment`, `Notification` (in-app, NOT Laravel's), `ActivityLog`, `Setting` |
| Services | `app/Services/` — `TaskService`, `ProjectService`, `ProjectHealthService`, `DeadlineService`, `NotificationService`, `ActivityLogger`, `Settings` |
| Auth/authz | `app/Policies/ProjectPolicy.php`, `app/Policies/TaskPolicy.php`, `Gate::before` (admins pass all), `Gate 'admin'`, middleware alias `admin`, `EnsureUserIsActive`, `RunDeadlineChecks`, `SecurityHeaders` |
| Routes | `routes/web.php` — **all routes and names are final**. Implement the controller methods they point to. |
| Layout | `resources/views/components/layouts/app.blade.php` (`<x-layouts.app title="…" :full-width="false" :bare="false">`) and `layouts/guest.blade.php` (`<x-layouts.guest title="…">`) |
| Components | `resources/views/components/*` (see §4) |
| CSS/JS | `resources/css/app.css` (utility classes in §5), `resources/js/app.js` auto-loads `resources/js/components/*.js`; `core.js` has `toasts`, `statusProgress`, `window.taskflowFetch` |
| Seed data | `database/seeders/DatabaseSeeder.php`, factories for User/Project/Task |
| Tests | `tests/TestCase.php` (calls `withoutVite()`, helpers `admin()`, `regularUser()`), `tests/Feature/Foundation/TaskServiceTest.php` |

If you believe a foundation file has a bug or is missing something you need, **do not edit it** — work around it
inside your own files and describe the problem in your final report under *foundation requests*.
The only exception: files explicitly listed as yours in §7 (including the three placeholder partials).

---

## 2. Business rules (enforced in services — always mutate through them)

* **Hierarchy**: Project → Tasks → Subtasks (one level). `TaskService::create` forces a subtask's `project_id` to its parent's.
* **Single primary assignee** (`tasks.assignee_id`). Collaborators are separate (`task_collaborators`). The assignee is never also a collaborator.
* **Statuses**: Pending, In Progress, Completed, Delayed, On Hold, Cancelled. **Progress**: 0% Pending, 1–99% In Progress, 100% Completed.
* **History is append-only**: every status/progress/remark/assignment/detail change writes a `task_updates` row with old/new status, old/new progress, user and timestamp. `TaskUpdate` throws on update/delete.
* **Auto-delay**: Pending/In Progress tasks past their due date become Delayed (system update, notification). Picking Pending/In Progress on an overdue task keeps it Delayed. Moving the due date forward clears an automatic delay.
* **Roll-up**: a parent's progress = average of non-cancelled subtasks (its progress field is locked in the UI). Project progress = average of top-level non-cancelled tasks.
* **Project health** (`ProjectHealthService::evaluate($project)` → `['health' => ProjectHealth, 'reasons' => string[], 'stats' => [...]]`) with thresholds in Settings. Cached on `projects.health` / `projects.progress`.
* **Auto membership (reduced duplicate entry)**: creator, assignee and collaborators are automatically added as project members.
* **Authorization boundaries**: admins can do everything. Regular users see only projects they own/created/are members of and tasks inside them (plus tasks they're assigned/collaborating on). See policies.

### Service API (use these, don't re-implement)

```php
TaskService::create(array $data, User $actor): Task
    // keys: project_id, parent_id, title, description, priority, assignee_id, start_date, due_date, status, progress, collaborator_ids[]
TaskService::applyUpdate(Task $task, User $actor, ?string $status, int|string|null $progress, ?string $remark): ?TaskUpdate  // null = nothing changed
TaskService::updateDetails(Task $task, array $data, User $actor): Task   // title, description, priority, start_date, due_date, assignee_id
TaskService::addCollaborator(Task $task, User $user, User $actor): bool
TaskService::removeCollaborator(Task $task, User $user, User $actor): bool
TaskService::delete(Task $task, User $actor): void

ProjectService::create(array $data, User $actor): Project  // name, description, owner_id, status, priority, color, start_date, due_date, member_ids[]
ProjectService::update(Project $project, array $data, User $actor): Project
ProjectService::addMember(Project $p, User $u, User $actor, ProjectMemberRole $role = Member): bool
ProjectService::changeMemberRole(Project $p, User $u, ProjectMemberRole $role, User $actor): bool
ProjectService::removeMember(Project $p, User $u, User $actor): bool   // false for the owner
ProjectService::delete(Project $p, User $actor): void

ProjectHealthService::evaluate(Project $p): array   /  ::refresh(Project $p)  /  ::refreshAll()
DeadlineService::run()                               // delay + reminders + health
NotificationService::send($recipients, NotificationType $type, string $title, ?string $message, ?string $url, ?Model $subject, array $data = [], ?User $actor = null)
NotificationService::mentions(string $text, Task $task, ?Model $subject, ?User $actor): Collection   // parses @username
ActivityLogger::log(string $action, string $description, ?Model $subject = null, array $properties = [], ?User $user = null)
Settings::int('deadline.due_soon_days') / ::bool() / ::string() / ::set([...]) / ::grouped() / Settings::DEFINITIONS
```

### Useful model API

```php
Project::visibleTo($user)  ->active()          $project->tasks (top-level)  ->allTasks  ->members (pivot role)  ->owner
$project->isMember($u) ->isManager($u) ->memberRole($u) ->taskCounts() ->isOverdue()
Task::visibleTo($user) ->involving($user) ->topLevel() ->open() ->status($s) ->dueSoon(?$days) ->overdue() ->betweenDates($from, $to)
$task->project ->parent ->subtasks ->assignee ->creator ->collaborators ->updates (newest first) ->comments ->attachments
$task->isSubtask() ->isOverdue() ->isDueSoon() ->dueLabel() ->isCollaborator($u) ->stakeholderIds()
$user->isAdmin() ->initials() ->firstName() ->unreadNotifications() ->notifications ->projects ->assignedTasks
TaskStatus::options() ::openValues() ::fromProgress($p)  $status->label() ->color() ->isOpen()
```

Policies: `@can('view'|'update'|'delete', $project)`, `@can('manageMembers', $project)`, `@can('createTask', $project)`,
`@can('view'|'update'|'edit'|'manageCollaborators'|'addSubtask'|'comment'|'delete', $task)`, `@can('admin')`.
Note `update` on a task = quick status/progress/remark update; `edit` = change details.

Activity log action names: `auth.login`, `auth.logout`, `auth.failed`, `auth.locked`, `project.created|updated|deleted|status_changed|member_added|member_removed|member_role_changed`,
`task.created|updated|status_changed|progress_updated|remark_added|completed|delayed|assigned|deleted`, `collaborator.added|removed`, `comment.added|deleted`,
`attachment.uploaded|deleted`, `user.created|updated|activated|deactivated|unlocked|password_reset|role_changed`, `settings.updated`, `profile.updated|password_changed`.

---

## 3. Route map (names are final — see `routes/web.php`)

Guest: `login` (GET), `login.store` (POST). Auth: `logout`, `dashboard` (`/`), `profile.edit|update|password`,
`projects.index|create|store|show|edit|update|destroy`, `projects.members.store|update|destroy`,
`tasks.index|create|store|show|edit|update|destroy` (`tasks.create` accepts `?project_id=&parent_id=&due_date=&assignee_id=` to pre-fill),
`tasks.updates.store|index`, `tasks.collaborators.store|destroy`, `tasks.comments.store`, `comments.destroy`,
`tasks.attachments.store`, `attachments.show|destroy`, `calendar` (`?view=month|week|day&date=Y-m-d&project_id=&scope=mine|all`),
`notifications.index|recent|open|read|read-all`, `search` (`?q=`), `search.suggest` (JSON), `quick-create` (POST),
`lookup.users` (JSON), `lookup.parent-tasks` (JSON).
Admin (`admin.` prefix, `admin` middleware): `admin.executive`, `admin.meeting`, `admin.users.index|create|store|edit|update|toggle-active|unlock|password`,
`admin.activity-logs.index`, `admin.settings.edit|update`.

### JSON contracts

* `GET /lookup/users?q=&project_id=&limit=10` → `{"data":[{"id":1,"name":"…","username":"…","email":"…","job_title":"…","initials":"MS","avatar_color":"violet"}]}` — active users only; when `project_id` is given, members of that project first.
* `GET /lookup/projects/{project}/parents` → `{"data":[{"id":1,"title":"…"}]}` — top-level tasks of a project the user can view.
* `GET /search/suggest?q=` → `{"query":"…","groups":[{"key":"projects","label":"Projects","items":[{"id":1,"title":"…","subtitle":"…","url":"…","badge":{"label":"At Risk","color":"amber"}}]}]}` (groups: projects, tasks, subtasks, users; ≤5 items each).
* `GET /notifications/recent` → `{"unread_count":3,"data":[{"id":1,"type":"task_assigned","title":"…","message":"…","icon":"user-plus","color":"indigo","read":false,"time":"5 minutes ago","open_url":"…/notifications/1/open","actor":{"name":"…","initials":"…","avatar_color":"…"}|null}]}`
* `POST /tasks/{task}/updates` accepts `status`, `progress`, `remark`. HTML requests redirect back with `success` flash; JSON requests (`Accept: application/json`) return `{"ok":true,"task":{"id","status","status_label","progress","latest_remark"}}` or 422.

---

## 4. Blade components (use them for visual consistency)

```blade
<x-layouts.app title="Projects"> … </x-layouts.app>
<x-page-header title="Projects" description="…" :back="route('…')"><x-slot:actions>…buttons…</x-slot:actions><x-slot:meta>…</x-slot:meta></x-page-header>
<x-icon name="folder" class="h-4 w-4" />      {{-- names: see components/icon.blade.php --}}
<x-status-badge :status="$task->status" size="sm|md|lg" />
<x-priority-badge :priority="$task->priority" :show-low="false" />
<x-health-badge :health="$project->health" size="sm|md|lg" />
<x-project-status-badge :status="$project->status" />
<x-progress-bar :value="$task->progress" size="xs|sm|md|lg" :show-label="true" color="indigo" />
<x-avatar :user="$user" size="xs|sm|md|lg|xl" />   <x-avatar-stack :users="$task->collaborators" :max="4" />
<x-due-date :task="$task" format="M j" />
<x-stat-card label="Delayed" :value="3" icon="alert" color="red" :href="…" hint="…" />
<x-empty-state icon="folder" title="No projects yet" description="…">…optional action…</x-empty-state>
<x-modal name="invite" title="Add member" max-width="lg"> … </x-modal>   {{-- open: $dispatch('open-modal', 'invite') --}}
<x-dropdown align="right" width="w-56"><x-slot:trigger>…</x-slot:trigger><x-dropdown-link :href="…" icon="pencil">Edit</x-dropdown-link></x-dropdown>
<x-form.input name="title" label="Title" :value="$task->title" required />
<x-form.select name="priority" label="Priority" :options="\App\Enums\Priority::options()" :value="$task->priority" placeholder="—" />
<x-form.textarea name="description" label="Description" :value="…" rows="4" />
<x-form.field label="Custom" name="field" help="…">…any control…</x-form.field>
<x-task-row :task="$task" :show-project="true" :show-assignee="true" :quick-update="true" />   {{-- list row + inline quick update --}}
<x-quick-update :task="$task" :compact="false" />   {{-- status/progress/remark form --}}
```

Wrap lists of `<x-task-row>` in `<div class="card divide-y divide-slate-100">`. Eager-load `project, assignee, parent, collaborators` for rows.

## 5. Styling conventions

* Utilities from `app.css`: `btn-primary`, `btn-secondary`, `btn-danger`, `btn-ghost`, `btn-sm`, `btn-icon`, `form-label`, `form-input`, `form-select`, `form-checkbox`, `form-help`, `form-error`, `card`, `card-header`, `card-title`, `card-body`, `link`, `chip`, `.table` (wrap in `<div class="overflow-x-auto">`).
* Palette: slate neutrals, indigo primary; status/health colours come from enum `color()` — dynamic classes like `bg-{{ $c }}-50 text-{{ $c }}-700` are safelisted for shades 50–800.
* Mobile first: every page must work at 375px. Use `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`, hide secondary columns with `hidden md:table-cell`, stack actions.
* Clean, lots of whitespace, `rounded-xl` cards, `text-sm` body, clear status indicators everywhere, minimal clicks.
* Flash messages: `return back()->with('success', 'Task updated.')` (also `error`, `warning`) — shown as toasts by the layout.
* Confirm destructive actions with `onsubmit="return confirm('…')"` on the form.
* Alpine components: put them in **your own** `resources/js/components/<module>.js` using `document.addEventListener('alpine:init', () => Alpine.data('name', () => ({…})))`. Don't edit `app.js`/`core.js`.

## 6. Code conventions

* Controllers thin; validation in Form Requests under `app/Http/Requests/<Module>/` (or `$request->validate` for tiny cases).
* Authorize every action: `$this->authorize()` is NOT available on the base controller — use `Gate::authorize('update', $task)` or `$request->user()->can(...)` / `abort_unless(...)`.
* Always scope queries for regular users with `Project::visibleTo($user)` / `Task::visibleTo($user)`. Never trust IDs from the request (validate `exists` AND check visibility).
* Eager-load to avoid N+1; paginate long lists (`->paginate(20)->withQueryString()`).
* Escape output with `{{ }}`; never `{!! !!}` on user content.
* Dates: `$task->due_date?->format('M j, Y')`. Timezone from `APP_TIMEZONE`.
* Tests: PHPUnit feature tests in `tests/Feature/<Module>/`, `use RefreshDatabase;`. Build data with factories + services. Run **only your own tests**: `php artisan test tests/Feature/<Module>`. Do NOT run `npm run build`/`npm run dev` (the integrator builds assets). Do not run `migrate:fresh` on the dev database.

## 7. Module ownership (each module owns ONLY these files)

| Module | Controllers | Views / JS | Tests |
|---|---|---|---|
| **M1 Auth, Profile, Users, Settings** | `Auth/LoginController`, `ProfileController`, `Admin/UserController`, `Admin/SettingController` | `auth/login`, `profile/*`, `admin/users/*`, `admin/settings/*` | `tests/Feature/Auth`, `tests/Feature/AdminUsers`, `tests/Feature/Settings`, `tests/Feature/Profile` |
| **M2 Projects** | `ProjectController`, `ProjectMemberController` | `projects/*` | `tests/Feature/Projects` |
| **M3 Tasks** | `TaskController`, `TaskUpdateController` | `tasks/index`, `tasks/create`, `tasks/edit`, `tasks/show`, `tasks/_form`, `tasks/partials/{subtasks,history,details}` | `tests/Feature/Tasks` |
| **M4 Collaboration & Notifications** | `TaskCollaboratorController`, `TaskCommentController`, `AttachmentController`, `NotificationController`, `LookupController` | `tasks/partials/{collaborators,comments,attachments}`, `notifications/*`, `partials/notification-bell`, `js/components/collaboration.js` | `tests/Feature/Collaboration`, `tests/Feature/Notifications` |
| **M5 Dashboard & Calendar** | `DashboardController`, `CalendarController` | `dashboard/*`, `calendar/*`, `js/components/calendar.js` | `tests/Feature/Dashboard`, `tests/Feature/Calendar` |
| **M6 Management (admin)** | `Admin/ExecutiveDashboardController`, `Admin/MeetingController`, `Admin/ActivityLogController` | `admin/executive/*`, `admin/meeting/*`, `admin/activity-logs/*`, `js/components/management.js` | `tests/Feature/Management` |
| **M7 Search & Quick Create** | `SearchController`, `QuickCreateController` | `search/*`, `partials/search-bar`, `partials/quick-create`, `js/components/search.js` | `tests/Feature/Search` |

Form requests go in `app/Http/Requests/<YourModule>/`. Any new helper class goes in `app/Support/<YourModule>/` or `app/Http/ViewModels/<YourModule>/`.

**Cross-module view contracts** (build to these even if the other module is unfinished):
* M3's `tasks/show.blade.php` includes `@include('tasks.partials.collaborators', ['task' => $task])`, `@include('tasks.partials.comments', ['task' => $task])`, `@include('tasks.partials.attachments', ['task' => $task])` (owned by M4). Each partial receives only `$task` (with `collaborators.*`, `comments.user`, `attachments.user` eager-loaded by M3) and renders a self-contained `card`. Guard with `@includeIf` so a missing partial does not break the page.
* M3's `tasks.create` pre-fills from `project_id`, `parent_id`, `due_date`, `assignee_id` query params (used by project pages, calendar and quick create).
* The layout includes `partials.search-bar`, `partials.quick-create`, `partials.notification-bell` with no parameters (they may use `auth()->user()` and the `$unreadNotificationCount` variable).

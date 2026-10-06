# TaskFlow — Architecture

TaskFlow is a role-based project and task management system (Administrator, Executive and User
roles). This document describes the business rules, how the code is organised, and where each
piece of the original Laravel application now lives.

## Business rules

All mutations go through the services in `src/lib/services/`, which enforce these rules.

- **Hierarchy:** Project → Tasks, or a standalone task. There are no subtasks (removed; the
  `parent_id` column was dropped in migration 0003, which turned any subtasks into ordinary tasks).
- **Standalone tasks:** projects are for long-term work; a task can also stand alone
  (`tasks.project_id` null) — a one-off finished in a day or a week. It has the same statuses,
  history, auto-delay, collaborators and notifications, but no project roll-up or health.
  Its creator, assignee, collaborators and admins can see it. The task forms offer "Part of a
  project" / "Standalone task" plus due-date shortcuts (Today, Tomorrow, 3 days, 1 week), and
  `?project_id=standalone` filters My Tasks and the calendar.
- **Completed projects and post-launch work:** owners/managers can **Mark as completed** (or
  **Reopen**) from the project page; the team is notified. Tasks added to a completed project are
  post-launch items (`tasks.category`: enhancement, bug fix or update), listed under
  "Enhancements & updates". They work like any task but are excluded from the project's progress,
  health and build-task counts.
- **Project suggestions** (`project_suggestions`): anyone who can see a project can leave a
  recommendation on its card (Projects list), shown one at a time, newest first. The author, the
  project's owner/managers and admins/executives can remove one; owner and managers are notified.
- **Single primary assignee** (`tasks.assignee_id`) — always the person who created the task; the
  task forms have no assignee field. Collaborators are separate (`task_collaborators`); the
  assignee is never also a collaborator.
- **Statuses:** Pending, In Progress, Completed, Delayed, On Hold, Cancelled. **Progress:** 0%
  Pending, 1–99% In Progress, 100% Completed. The quick-update form mirrors this client-side.
- **History is append-only:** every status, progress, remark, assignment and detail change writes
  a `task_updates` row. A database trigger rejects updates and deletes of those rows.
- **Auto-delay:** Pending/In Progress tasks past their due date become Delayed (system history
  entry + notification). Choosing Pending/In Progress on an overdue task keeps it Delayed.
  Moving the due date forward clears an automatic delay.
- **Roll-up:** project progress is the average of the project's non-cancelled tasks.
- **Project health** (`ProjectHealthService.evaluate`) — Completed, On Hold, Delayed, At Risk or
  On Track, from rules whose thresholds are admin settings. Cached on `projects.health` and
  `projects.progress`.
- **Membership is explicit:** people join a project only when someone adds them (project form or
  Team panel). Administrators and executives are never added as members or collaborators — they
  already see everything. Adding a collaborator doesn't enrol anyone. A collaborator can still open the
  task, but not the rest of the project.
- **Departments:** every user belongs to one of eight departments (Executive, HR, Leasing, Marketing,
  Security, Operations, IT, Accounting), which identifies a task's
  owning department through its assignee (My Tasks filter, executive dashboard breakdown).
- **Department walls:** a task's department is its assignee's (else its creator's). Regular users
  see — and, as project managers, manage — only their own department's tasks in their projects;
  another department's task is reachable only by its creator, assignee or collaborators
  (`taskVisibleTo`, `can.*Task`). Project progress and counts still include every task.
- **Authorization:** administrators can do everything. Executives have the same oversight
  (every project and task, executive dashboard, activity logs) but cannot use Meeting Mode,
  manage users or change settings (`requireAdmin` vs `requireFullAccess`; policies check `fullAccess`). Regular users see projects they own,
  created or are members of, the tasks inside them, and tasks they're assigned to or collaborate
  on. Project owner and managers edit projects and manage members; only the owner deletes.
- **Soft deletes:** deleted projects and tasks keep their rows (and history) with `deleted_at`
  set, and disappear from every query.
- **Sign-in protection:** per-IP throttle (20/min) plus per-account lockout after N failures
  (settings). Locked/deactivated messages are shown only to someone who knew the password;
  everyone else gets one generic message.

## Code map

| Concern | Location |
|---|---|
| Schema / migrations | `src/lib/db/schema.ts`, `drizzle/*.sql` |
| DB access + transactions | `src/lib/db/index.ts` — `db()` joins the caller's transaction automatically |
| Enums (statuses, priorities, departments…) | `src/lib/enums.ts` |
| Task / project / health / deadline rules | `src/lib/services/{tasks,projects,health,deadlines}.ts` |
| Daily briefing | `src/lib/services/{digest,briefing}.ts` |
| Notifications, @mentions | `src/lib/notifications.ts` |
| Activity log | `src/lib/activity.ts` |
| Settings | `src/lib/settings.ts` |
| Visibility scopes + policies | `src/lib/access.ts` |
| Sessions, login, passwords | `src/lib/auth/*` |
| Dates in `APP_TIMEZONE` | `src/lib/dates.ts` |
| Attachments (Blob / local) | `src/lib/storage.ts`, `src/app/api/attachments/upload`, `src/app/attachments/[id]` |
| Locks, rate limits | `src/lib/locks.ts` |
| Form validation (Laravel rules + messages) | `src/lib/validation.ts` |
| Pages | `src/app/(app)/**/page.tsx`, `src/app/(bare)/admin/meeting`, `src/app/login` |
| Writes | `src/app/actions/*.ts` (Server Actions) |
| UI components | `src/components/**` |

## From Laravel to Next.js

| Laravel | Now |
|---|---|
| `routes/web.php` routes | `src/app/**/page.tsx` (GET pages), `src/app/actions/*` (POST/PUT/DELETE) |
| Controllers | Page components (reads) + Server Actions (writes) |
| Form Requests / `$request->validate` | `Validator` in `src/lib/validation.ts`, same messages |
| Eloquent models + scopes | Drizzle schema + `src/lib/access.ts` scopes (`projectVisibleTo`, `taskVisibleTo`…) |
| Policies + `Gate::before` | `can.*` in `src/lib/access.ts` (admins pass everything) |
| Services (`TaskService`…) | Same names in `src/lib/services/` |
| Middleware `auth`, `admin`, `EnsureUserIsActive` | `requireUser()` / `requireAdmin()` in every page and action |
| Middleware `RunDeadlineChecks` | `after()` in `requireUser()`, throttled by a Postgres lock |
| Middleware `SecurityHeaders` | `headers()` in `next.config.ts` |
| Session guard (database sessions) | `sessions` table; cookie holds a random token, DB stores its SHA-256 |
| `RateLimiter` / `Cache::add` | `rate_limits` / `locks` tables |
| `abort(403)` / `abort(404)` | `forbidden()` / `notFound()` |
| `back()->with('success', …)` | `flash()` / `done()` in `src/lib/flash.ts` → toast stack |
| `old()` / `@error` | `ActionForm` + field components in `src/components/client/form.tsx` |
| Blade components (`<x-task-row>`…) | React components with the same names and markup |
| Alpine components | Client components (`src/components/client`, `src/components/shell`) |
| Scheduler + artisan commands | Vercel Cron → `src/app/api/cron/*`; `npm run digest` / `npm run deadlines` |
| `storage/app` attachments | Vercel Blob (private), local `.data/uploads` in development |
| SQLite | Postgres (Neon); embedded PGlite locally |
| PHPUnit feature tests | Vitest in `tests/`, against a real Postgres (PGlite) per file |

## Behaviour changes worth knowing

Ported faithfully, with these deliberate differences:

- **Collaborators** are added from a list of people, rather than by typing a numeric user ID.
- **Team panel:** managers can change a member's role or remove them in place (the routes existed
  in Laravel but had no UI).
- **Deactivating a user, or an admin resetting their password**, signs them out of every session
  immediately.
- **Search** is case-insensitive on Postgres (`ILIKE`), matching SQLite's behaviour.
- **Notification links** are stored as site-relative paths, so they work on any domain.
- **Task rows** adapt to the width of the panel they're in, so titles stay readable in narrow
  columns.

# TaskFlow

A role-based project and task management system: projects and their tasks plus quick standalone tasks, status and
progress tracking with append-only history, automatic delay detection, project health,
collaboration (collaborators, comments, @mentions, attachments), a calendar, a notification
centre, an 08:00 weekday briefing written by Claude, and an administrator area with an executive
dashboard, meeting mode, user management, activity logs and settings.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · Tailwind CSS 4 · Drizzle ORM ·
Postgres (Neon on Vercel) · Vercel Blob · Vercel Cron. Built to deploy on Vercel — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

> This is a rewrite of the original Laravel 12 application. Every route, rule and screen was
> ported; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) maps the Laravel pieces to their new homes.

## Run it locally

Requires Node.js 20.9 or newer. No database install needed.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Set `ADMIN_EMAIL`, `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env.local`, then:

```bash
npm run dev
```

Open <http://localhost:3000> and sign in with that account. `npm run dev` starts an embedded
Postgres (PGlite, stored in `.data/pglite`), applies migrations, creates or updates the
administrator, and starts Next.js. To work against a real Postgres instead, set `DATABASE_URL`.

Optional sample data — seven people and five projects with history (password `password`):

```bash
npm run db:seed-demo
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local database + migrations + admin seed + `next dev` |
| `npm run build` / `npm run start` | Production build / serve it locally |
| `npm test` | Business-rule test suite (Vitest, in-memory Postgres per file) |
| `npm run typecheck` | TypeScript |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Roles + administrator from `ADMIN_*` (safe to re-run) |
| `npm run db:seed-demo` | Sample people, projects and history |
| `npm run db:reset` | Local embedded database only: wipe, migrate, seed |
| `npm run db:generate` | Generate a migration after changing `src/lib/db/schema.ts` |
| `npm run digest -- --dry-run` | The 08:00 briefing on demand (`--user=`, `--force`) |
| `npm run deadlines` | Mark overdue tasks Delayed, send reminders, refresh health |

## Where things live

```
src/app/(app)/…          pages behind sign-in (dashboard, tasks, projects, calendar, admin…)
src/app/(bare)/…         meeting mode (full-screen, no sidebar)
src/app/actions/…        Server Actions — the old controllers' write endpoints
src/app/api/…            JSON endpoints, Blob upload tokens, cron jobs
src/lib/services/…       business rules: tasks, projects, health, deadlines, digest, briefing
src/lib/access.ts        visibility scopes and policies (who may see / change what)
src/lib/db/schema.ts     database schema; SQL migrations in drizzle/
src/components/…         UI components (ported from the Blade components)
tests/…                  Vitest suite
```

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deploying to Vercel, step by step
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — business rules, data model, Laravel → Next.js map
- [docs/AUTOMATION.md](docs/AUTOMATION.md) — the 08:00 briefing, deadline checks, cron

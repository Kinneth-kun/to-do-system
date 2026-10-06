# Deploying TaskFlow to Vercel

TaskFlow runs on Vercel as a standard Next.js project. It needs three things Vercel doesn't keep
for you between requests, each provided by a Vercel-connected service:

| Need | Service | Why |
|---|---|---|
| Database | **Neon Postgres** (Vercel Marketplace) | Vercel functions have no persistent disk, so SQLite cannot work |
| File attachments | **Vercel Blob** (private store) | Same reason; uploads go browser → Blob directly, since function request bodies are capped at 4.5 MB |
| The 08:00 briefing and deadline sweep | **Vercel Cron** | Replaces `php artisan schedule:work` |

Sessions, login throttling and the "run the deadline check at most every 5 minutes" lock all
live in Postgres, so any number of function instances can serve requests.

---

## 1. Push the code

Commit this branch and push it to GitHub (`Kinneth-kun/to-do-system`). Merge it into `main` if
that is the branch you want Vercel to deploy to production.

## 2. Create the Vercel project

1. <https://vercel.com/new> → import the repository.
2. Framework preset: **Next.js** (detected). Leave the build settings alone — `vercel.json` sets
   the build command to `npm run vercel-build`, which applies database migrations, creates the
   administrator, then runs `next build`.
3. Don't deploy yet — add the database and variables first (or let the first deploy fail and
   redeploy after step 5).

## 3. Add the database

Project → **Storage** → **Create** → **Neon** (Postgres). Connect it to all environments. This
sets `DATABASE_URL` automatically.

Choose the region closest to your users and pin the project's **Function Region** to the same one
(Project → Settings → Functions) — every page makes several queries, so co-locating them matters.
For Manila, Singapore (`sin1`) is the natural choice.

## 4. Add file storage

Project → **Storage** → **Create** → **Blob**, and pick **private** access. Connect it to the
project, then make sure the project has a `BLOB_READ_WRITE_TOKEN` environment variable (shown on
the store's page) — browser uploads need it to request upload tokens.

Without a Blob store, attachment uploads on Vercel will fail; everything else works.

## 5. Environment variables

Project → Settings → **Environment Variables**:

| Variable | Value |
|---|---|
| `APP_TIMEZONE` | `Asia/Manila` — "today", overdue and due-soon are decided in this zone |
| `ADMIN_NAME` | Your name |
| `ADMIN_EMAIL` | Your email — the administrator account is created or updated on every deploy |
| `ADMIN_USERNAME` | Your username |
| `ADMIN_PASSWORD` | A strong password. Only written when set — remove it after the first deploy if you'd rather change it in the app |
| `CRON_SECRET` | A long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Vercel sends it to the cron endpoints; without it they refuse to run in production |
| `BLOB_ACCESS` | `private` (match the store) |
| `ANTHROPIC_API_KEY` | Optional — enables Claude-written briefings |
| `ANTHROPIC_MODEL` | Optional, default `claude-opus-5-5` |

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` come from steps 3 and 4.

## 6. Deploy

Deploy (or redeploy). The build log should show `Migrations applied.` and
`Created administrator …`. Then:

- Open the deployment URL and sign in.
- `https://<your-app>/up` returns `{"status":"ok"}` when the database is reachable.
- Project → **Cron Jobs** lists `/api/cron/daily-digest` and `/api/cron/check-deadlines`. You can
  run either from there to test it.

---

## The schedule

`vercel.json` defines the cron jobs. Vercel cron schedules are always **UTC**:

| Job | Schedule (UTC) | Manila time |
|---|---|---|
| Daily briefing | `0 0 * * 1-5` | 08:00, Monday–Friday |
| Deadline sweep | `5 16 * * *` | 00:05 daily |

If your `APP_TIMEZONE` is not Asia/Manila, adjust these hours. The briefing endpoint also skips
weekends in `APP_TIMEZONE` on its own.

Both jobs are scheduled once a day so they work on the Hobby plan. Overdue tasks don't wait for
the nightly sweep: whenever someone uses the app, the same check runs in the background at most
once every five minutes. On Pro, you can make the sweep hourly (`0 * * * *`) as the Laravel app
had it.

## Preview deployments

`vercel-build` migrates whatever database `DATABASE_URL` points at. If previews share the
production database, a preview build of a branch with a new migration will apply it to
production. Neon's Vercel integration can give each preview its own database branch — turn that
on (Storage → your Neon store → settings) before you add migrations on branches.

## Moving data from the Laravel app

The schema keeps the Laravel table and column names, and password hashes from PHP (`$2y$`) are
accepted as-is, so existing rows can be copied into Postgres table by table. The local SQLite
database in the old project only held demo data, so this wasn't needed here.

## Costs

The Hobby plan, Neon's free tier and Blob's free allowance cover a small team. AI briefings cost
roughly a few hundred tokens per person per weekday when `ANTHROPIC_API_KEY` is set.

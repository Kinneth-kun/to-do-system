# Deploying TaskFlow

Target: **Render**, one web service with a persistent disk. Everything — the app, the SQLite
database, uploaded attachments and the 08:00 weekday briefing — runs in that one service.

The same `Dockerfile` works on Railway, Fly.io or any Docker host; only `render.yaml` is
Render-specific.

---

## Why it is shaped this way

- **A disk, not a managed database.** SQLite on a mounted disk keeps the deployment to one paid
  service and needs no code changes. Switching to Postgres later is env-vars only — `pdo_pgsql`
  is already in the image.
- **The scheduler runs inside the web container.** On Render a disk attaches to a *single*
  service and **cron jobs cannot read it**, so a separate cron service could not reach the
  database. Supervisor runs Apache and `php artisan schedule:work` side by side.
- **Two consequences of using a disk:** deploys are not zero-downtime (the old instance stops
  before the new one starts — a few seconds), and the service cannot scale beyond one instance.
  Both are fine for an internal tool; neither is fine for hundreds of concurrent users.

---

## 1. Push the branch

The blueprint deploys from GitHub, so merge `feat/taskflow-app` into `main` first (or point
Render at the branch).

## 2. Create the service

1. <https://dashboard.render.com> → **New** → **Blueprint**
2. Connect `Kinneth-kun/to-do-system` and pick the branch. Render reads `render.yaml`.
3. It will ask for the values marked `sync: false`. Fill them in:

| Variable | Value |
|---|---|
| `APP_KEY` | `base64:6RcOzUhUqMGJy7N0bDCm7kErAxYSpJv+l9Fn+qAsZD4=` (generated for you — or run `php artisan key:generate --show`) |
| `APP_URL` | `https://taskflow-xxxx.onrender.com` — set it after Render shows you the URL, then redeploy |
| `ADMIN_NAME` | Kinneth Daluag |
| `ADMIN_EMAIL` | kinnethdaluag.pro@gmail.com |
| `ADMIN_USERNAME` | kinnethdaluag.pro |
| `ADMIN_PASSWORD` | the password from your local `.env` — or a new one |
| `ANTHROPIC_API_KEY` | optional; leave blank for plain-text briefings |

4. **Create**. The first build takes a few minutes (Composer + npm + the PHP image).

On boot the container creates the database file if missing, runs `migrate --force`, creates or
updates the administrator from the `ADMIN_*` variables, caches config/routes/views, then starts
Apache and the scheduler.

## 3. Check it

- Open the URL and sign in.
- `/up` should return 200 (Render's health check uses it).
- Logs should end with `TaskFlow ready — scheduler and web server starting.`
- In Render's shell: `php artisan schedule:list` → `0 8 * * 1-5 php artisan taskflow:daily-digest`.
- Send yourself a briefing without waiting for Monday:
  `php artisan taskflow:daily-digest --force`

---

## What was verified locally, and what was not

| Checked here | How |
|---|---|
| App boots, all pages render, 107 tests pass | `php artisan test` |
| Schedule registered as `0 8 * * 1-5` | `php artisan schedule:list` + a test asserting the expression |
| Entrypoint script syntax | `bash -n docker/entrypoint.sh` |
| Config files are valid PHP | `php -l` |
| **The Docker image builds** | **Not verified — Docker is not installed on this machine.** Render's first build is the real test. |

If the first build fails it will almost certainly be a missing PHP extension or an npm step;
the build log names it and it is a one-line fix in the `Dockerfile`.

---

## Cost

Render's Starter instance plus a 1 GB disk is roughly **$7–8/month**. A disk requires a paid
instance — the free tier has no persistent storage and sleeps when idle, which would both lose
your data and stop the 08:00 briefing.

Cheaper alternatives, if that matters more than simplicity:

- **Free Postgres (Neon) + Render free web service** — no disk needed for the database, but
  attachments still need object storage, and a sleeping free service delays the briefing.
- **A small VPS** (Hetzner/DigitalOcean, ~$5) — full control, but you maintain the server.

---

## After it is live

1. Set `APP_URL` to the real URL and redeploy — password-reset style links and the notification
   URLs in the digest are built from it.
2. Sign in and change the admin password from Profile if you want one you chose.
3. Watch the first weekday morning: the briefing should appear in the bell by 08:05.
4. The one thing to keep an eye on is disk usage — attachments and the database share the 1 GB.
   Render shows disk usage on the service page.

# Automation — the 08:00 briefing and deadline checks

Every weekday at 08:00, each active person with open work gets one notification summarising what
is overdue, due today and coming up. With an Anthropic API key configured, Claude writes the
summary; without one, a plain generated summary is sent. **The briefing never depends on the API
being reachable** — if the call fails, times out or is declined, the plain summary goes out.

```
vercel.json                                  cron schedules (UTC)
src/app/api/cron/daily-digest/route.ts       the 08:00 briefing endpoint
src/app/api/cron/check-deadlines/route.ts    the deadline sweep endpoint
src/lib/services/digest.ts                   builds and sends the digest
src/lib/services/briefing.ts                 writes the summary with Claude (optional)
src/components/shell/notification-bell.tsx   live bell: polls for new notifications
```

## Schedule

Vercel Cron calls the endpoints with `Authorization: Bearer $CRON_SECRET`. Schedules are UTC:
`0 0 * * 1-5` is 08:00 Monday–Friday in Manila. See [DEPLOYMENT.md](DEPLOYMENT.md#the-schedule)
to change the hour for another timezone.

Overdue detection doesn't rely on cron alone: after any signed-in request, the deadline check
runs in the background at most once every five minutes across all instances (a Postgres lock
coordinates them).

## AI summary (optional)

Set `ANTHROPIC_API_KEY` in the Vercel project. Optional overrides:

```
ANTHROPIC_MODEL=claude-opus-5-5   # default
ANTHROPIC_EFFORT=low              # low | medium | high
ANTHROPIC_TIMEOUT=30              # seconds per call
```

If the model declines a request, Anthropic's server-side fallback retries it on a recommended
fallback model within the same call; if that also fails, the plain summary is used.

**What is sent:** the person's first name and department, today's date, counts, and the title,
status, progress, project and due date of up to a few tasks. No email addresses, comments or
attachments. Task titles are user-written, so they go inside a delimited block the system prompt
marks as untrusted data, and the reply is rendered as escaped plain text.

## Controls

Admin → Settings → **Daily briefing**:

| Setting | Default | Meaning |
|---|---|---|
| Send the 8:00 am briefing | on | Master switch |
| Send even when there is nothing open | off | On a clear day, send nothing rather than "nothing to do" |
| Write the summary with AI | on | Falls back to a plain summary when there is no API key |

## Testing without waiting for Monday

Locally:

```bash
npm run digest -- --dry-run
```

```bash
npm run digest -- --user=maria --force
```

On Vercel: Project → Cron Jobs → run the job, or call the endpoint with the secret:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>/api/cron/daily-digest?dry_run=1&force=1"
```

A person is briefed at most once a day (in `APP_TIMEZONE`) unless forced. People with no open
work are skipped, and deactivated accounts are never briefed.

## Live notifications

The bell polls `/api/notifications/recent` every 45 seconds, so the briefing, assignments, delays
and mentions appear without a refresh, with a toast for anything new. Polling pauses while the
tab is in the background and catches up when you return.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Nothing at 08:00 | `CRON_SECRET` missing in production (the endpoint refuses to run), or the cron job is disabled in the Vercel dashboard |
| Arrives at the wrong hour | The `vercel.json` schedule is UTC — adjust it for your timezone |
| Summary reads mechanically | No API key, or AI switched off in Settings |
| "already briefed today" | One per person per day by design; use `--force` / `?force=1` |
| Everyone skipped | Nobody has open work; enable "Send even when there is nothing open" |
| API errors | Logged as warnings in the function logs; the digest still sends |

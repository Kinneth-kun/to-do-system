# Automation — the 8:00 am briefing

Every weekday at 08:00, each active person gets one notification summarising what is overdue,
due today and coming up. With an Anthropic API key configured, the summary is written by Claude;
without one, a plain generated summary is sent instead. **The briefing never depends on the API
being reachable** — if the call fails, times out or is refused, the digest still goes out.

```
routes/console.php              →  schedule: 0 8 * * 1-5, in APP_TIMEZONE
app/Console/Commands/SendDailyDigest.php   →  builds and sends the digest
app/Services/AI/BriefingService.php        →  writes the summary with Claude (optional)
resources/js/components/notifications.js   →  live bell: polls for new notifications
```

---

## 1. Run the scheduler (required — nothing fires without this)

Laravel's scheduler needs a process waking it up. Pick one.

### Option A — foreground (simplest, good while developing)

```bash
php artisan schedule:work
```

Leave it running. It checks every minute and fires the digest at 08:00 on weekdays.

### Option B — Windows Task Scheduler (survives reboots; use this for real)

Run once in an **Administrator** PowerShell. It runs the scheduler every minute in the background:

```powershell
schtasks /create /tn "TaskFlow Scheduler" /sc minute /mo 1 /ru "$env:USERNAME" /f /tr "cmd /c cd /d C:\MyProjects\to-do-system && C:\xampp\php\php.exe artisan schedule:run"
```

Check it, run it by hand, or remove it:

```powershell
schtasks /query /tn "TaskFlow Scheduler"
schtasks /run   /tn "TaskFlow Scheduler"
schtasks /delete /tn "TaskFlow Scheduler" /f
```

> The web server (`php artisan serve`) does **not** need to be running for the briefing to be
> created — the scheduler talks to the database directly. People see it next time they open the app.

---

## 2. Set the timezone (or 8am is not 8am)

The schedule fires at 08:00 in `APP_TIMEZONE`. It is set to `Asia/Manila` in `.env`:

```
APP_TIMEZONE=Asia/Manila
```

Leave it as UTC and the briefing arrives at 4:00 pm local. After changing it:
`php artisan config:clear`.

---

## 3. Turn on the AI summary (optional)

Without a key everything works; the summary is just plainer. To switch Claude on, add your key
to `.env` (git-ignored):

```
ANTHROPIC_API_KEY=sk-ant-...
# optional overrides
ANTHROPIC_MODEL=claude-opus-5
ANTHROPIC_EFFORT=low
ANTHROPIC_TIMEOUT=30
```

Then `php artisan config:clear`. Get a key at <https://console.anthropic.com>. Cost is roughly a
few hundred tokens per person per weekday — cents a month at this size, and nothing is sent to the
API on days when nobody has open work.

**What is sent:** the person's first name and department, today's date, counts, and the title,
status, progress, project and due date of up to a few tasks. Nothing else — no email addresses, no
comments, no attachments. Task titles are user-written, so they are passed inside a delimited
block that the system prompt marks as untrusted data, and the reply is rendered as escaped text.

---

## 4. Controls

Admin → Settings → **Daily briefing**:

| Setting | Default | Meaning |
|---|---|---|
| Send the 8:00 am briefing | on | Master switch for the digest |
| Send even when there is nothing open | off | On a clear day, send nothing rather than "nothing to do" |
| Write the summary with AI | on | Falls back to a plain summary when there is no API key |

---

## 5. Testing it without waiting until Monday

```bash
php artisan taskflow:daily-digest --dry-run          # show what would be sent, write nothing
php artisan taskflow:daily-digest --user=kinnethdaluag.pro --dry-run
php artisan taskflow:daily-digest --force            # send now, ignoring "already sent today"
php artisan schedule:list                            # confirm: 0 8 * * 1-5
```

A person is briefed at most once a day. People with no open work are skipped, and deactivated
accounts are never briefed.

---

## 6. Live notifications

The bell in the top bar polls `/notifications/recent` every 45 seconds, so the briefing (and
assignments, delays, mentions) appear without a refresh, with a toast for anything new. Polling
pauses while the tab is in the background and catches up when you return to it.

This is polling, not websockets — no extra process to run. If you later want true push, the same
endpoint can be swapped for Laravel Reverb/Echo without touching the digest.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Nothing at 08:00 | The scheduler is not running — see §1. Check with `schtasks /query /tn "TaskFlow Scheduler"`. |
| Arrives at the wrong hour | `APP_TIMEZONE` — see §2, then `php artisan config:clear`. |
| Summary reads mechanically | No API key, or AI switched off in Settings. That is the fallback summary. |
| "already briefed today" | One per person per day by design; use `--force`. |
| Everyone skipped | Nobody has open work. Enable "Send even when there is nothing open" to send anyway. |
| API errors | Logged as warnings in `storage/logs/`; the digest still sends with the plain summary. |

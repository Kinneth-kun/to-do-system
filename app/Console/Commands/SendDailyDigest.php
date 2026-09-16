<?php

namespace App\Console\Commands;

use App\Enums\NotificationType;
use App\Enums\TaskStatus;
use App\Models\Notification;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\BriefingService;
use App\Services\DeadlineService;
use App\Services\Settings;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Str;

/**
 * The 08:00 weekday briefing: one notification per person summarising what is overdue,
 * due today and coming up.
 *
 * Runs from the scheduler (see routes/console.php). Safe to run more than once — a person
 * receives at most one digest per day unless --force is given.
 */
class SendDailyDigest extends Command
{
    protected $signature = 'taskflow:daily-digest
        {--user= : Only this user id, username or email}
        {--dry-run : Show what would be sent without writing anything}
        {--force : Send again even if today\'s digest already went out}';

    protected $description = 'Send each person their morning summary of pending, overdue and upcoming work';

    public function handle(BriefingService $briefings): int
    {
        if (! Settings::bool('digest.enabled') && ! $this->option('force')) {
            $this->components->warn('The daily briefing is switched off in Settings.');

            return self::SUCCESS;
        }

        // Make sure overdue work is flagged before we describe it.
        DeadlineService::markOverdueTasksDelayed();

        $users = $this->recipients();

        if ($users->isEmpty()) {
            $this->components->warn('No matching active users.');

            return self::SUCCESS;
        }

        $this->components->info(sprintf(
            'Preparing briefings for %d %s%s. AI summaries: %s.',
            $users->count(),
            Str::plural('person', $users->count()),
            $this->option('dry-run') ? ' (dry run)' : '',
            $briefings->enabled() ? 'on' : ($briefings->configured() ? 'off in settings' : 'no API key — using plain summaries'),
        ));

        $sent = $skipped = 0;

        foreach ($users as $user) {
            if (! $this->option('force') && $this->alreadySentToday($user)) {
                $this->line("  <fg=gray>skipped</> {$user->name} — already briefed today");
                $skipped++;

                continue;
            }

            $workload = $this->workloadFor($user);

            if ($workload['open_total'] === 0 && ! Settings::bool('digest.include_quiet_days')) {
                $this->line("  <fg=gray>skipped</> {$user->name} — nothing open");
                $skipped++;

                continue;
            }

            $summary = $briefings->summarise($user, $workload) ?? $this->plainSummary($workload);
            $title = $this->title($workload);

            if ($this->option('dry-run')) {
                $this->line("  <fg=cyan>would send</> {$user->name}: {$title}");
                $this->line("      <fg=gray>{$summary}</>");
                $sent++;

                continue;
            }

            Notification::query()->create([
                'user_id' => $user->id,
                'actor_id' => null,
                'type' => NotificationType::DailyDigest,
                'title' => $title,
                'message' => $summary,
                'url' => route('dashboard'),
                'data' => [
                    'date' => today()->toDateString(),
                    'overdue' => count($workload['overdue']),
                    'due_today' => count($workload['due_today']),
                    'due_soon' => count($workload['due_soon']),
                    'open_total' => $workload['open_total'],
                    'ai' => $briefings->enabled(),
                ],
            ]);

            $this->line("  <fg=green>sent</> {$user->name}: {$title}");
            $sent++;
        }

        $this->newLine();
        $this->components->info("Briefings sent: {$sent}. Skipped: {$skipped}.");

        return self::SUCCESS;
    }

    /** @return Collection<int, User> */
    private function recipients(): Collection
    {
        $query = User::query()->active()->orderBy('name');

        if ($needle = $this->option('user')) {
            $query->where(fn ($q) => $q->where('id', $needle)->orWhere('username', $needle)->orWhere('email', $needle));
        }

        return $query->get();
    }

    private function alreadySentToday(User $user): bool
    {
        return Notification::query()
            ->where('user_id', $user->id)
            ->where('type', NotificationType::DailyDigest->value)
            ->whereDate('created_at', today())
            ->exists();
    }

    /**
     * Everything the briefing needs, for one person: work they are assigned or collaborating on.
     *
     * @return array<string, mixed>
     */
    private function workloadFor(User $user): array
    {
        $open = Task::query()
            ->involving($user)
            ->whereIn('status', TaskStatus::openValues())
            ->with(['project', 'assignee'])
            ->orderByRaw('due_date is null')
            ->orderBy('due_date')
            ->get();

        $overdue = $open->filter(fn (Task $t) => $t->status === TaskStatus::Delayed || $t->isOverdue());
        $dueToday = $open->filter(fn (Task $t) => $t->due_date?->isToday() && ! $overdue->contains($t));
        $dueSoon = $open->filter(fn (Task $t) => $t->isDueSoon() && ! $t->due_date?->isToday());

        return [
            'open_total' => $open->count(),
            'overdue' => $this->describe($overdue),
            'due_today' => $this->describe($dueToday),
            'due_soon' => $this->describe($dueSoon->take(5)),
            'completed_yesterday' => Task::query()
                ->involving($user)
                ->where('status', TaskStatus::Completed->value)
                ->whereDate('completed_at', today()->subDay())
                ->count(),
        ];
    }

    /**
     * @param  Collection<int, Task>|\Illuminate\Support\Collection<int, Task>  $tasks
     * @return list<array<string, mixed>>
     */
    private function describe($tasks): array
    {
        return $tasks->take(8)->map(fn (Task $task) => [
            'title' => $task->title,
            'status' => $task->status->label(),
            'progress' => $task->progress,
            'project' => $task->project?->name ?? '—',
            'due' => $task->due_date?->format('j M'),
        ])->values()->all();
    }

    /** @param array<string, mixed> $workload */
    private function title(array $workload): string
    {
        $overdue = count($workload['overdue']);
        $dueToday = count($workload['due_today']);

        return match (true) {
            $overdue > 0 && $dueToday > 0 => "{$overdue} overdue, {$dueToday} due today",
            $overdue > 0 => $overdue.' overdue '.Str::plural('task', $overdue),
            $dueToday > 0 => $dueToday.' '.Str::plural('task', $dueToday).' due today',
            default => 'Your day: '.$workload['open_total'].' open '.Str::plural('task', $workload['open_total']),
        };
    }

    /**
     * Used when AI summaries are unavailable — the digest still has to say something useful.
     *
     * @param  array<string, mixed>  $workload
     */
    private function plainSummary(array $workload): string
    {
        $parts = [];

        if ($overdue = count($workload['overdue'])) {
            $parts[] = $overdue.' '.Str::plural('task', $overdue).' past their due date, starting with "'.$workload['overdue'][0]['title'].'"';
        }
        if ($dueToday = count($workload['due_today'])) {
            $parts[] = $dueToday.' due today';
        }
        if ($dueSoon = count($workload['due_soon'])) {
            $parts[] = $dueSoon.' due in the next few days';
        }

        if ($parts === []) {
            return 'Nothing is overdue or due shortly. You have '.$workload['open_total'].' open '
                .Str::plural('task', $workload['open_total']).' in total.';
        }

        return 'You have '.implode(', ', $parts).'.'
            .($workload['completed_yesterday'] > 0 ? ' You completed '.$workload['completed_yesterday'].' yesterday.' : '');
    }
}

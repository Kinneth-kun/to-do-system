<?php

namespace App\Services;

use App\Enums\NotificationType;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class NotificationService
{
    /**
     * Send a notification to one or many users. The acting user is never notified about their own action.
     *
     * @param  User|int|iterable<User|int>  $recipients
     * @return Collection<int, Notification>
     */
    public static function send(
        User|int|iterable $recipients,
        NotificationType $type,
        string $title,
        ?string $message = null,
        ?string $url = null,
        ?Model $subject = null,
        array $data = [],
        ?User $actor = null,
        bool $notifyActor = false,
    ): Collection {
        $actor ??= Auth::user();

        $ids = collect(is_iterable($recipients) ? $recipients : [$recipients])
            ->map(fn ($r) => $r instanceof User ? $r->id : (int) $r)
            ->filter()
            ->unique();

        if (! $notifyActor && $actor) {
            $ids = $ids->reject(fn ($id) => $id === $actor->id);
        }

        $activeIds = User::query()->whereIn('id', $ids)->where('is_active', true)->pluck('id');

        return $activeIds->map(fn ($id) => Notification::query()->create([
            'user_id' => $id,
            'actor_id' => $actor?->id,
            'type' => $type,
            'title' => Str::limit($title, 250),
            'message' => $message,
            'url' => $url,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'data' => $data ?: null,
        ]));
    }

    public static function taskAssigned(Task $task, User $assignee, ?User $actor = null): void
    {
        $actor ??= Auth::user();
        self::send($assignee, NotificationType::TaskAssigned,
            ($actor?->firstName() ?? 'Someone').' assigned you "'.$task->title.'"',
            'Project: '.$task->project->name.($task->due_date ? ' · Due '.$task->due_date->format('M j, Y') : ''),
            route('tasks.show', $task), $task, actor: $actor);
    }

    public static function collaboratorAdded(Task $task, User $collaborator, ?User $actor = null): void
    {
        $actor ??= Auth::user();
        self::send($collaborator, NotificationType::CollaboratorAdded,
            ($actor?->firstName() ?? 'Someone').' added you as a collaborator on "'.$task->title.'"',
            'Project: '.$task->project->name,
            route('tasks.show', $task), $task, actor: $actor);
    }

    public static function projectMemberAdded(Project $project, User $member, ?User $actor = null): void
    {
        $actor ??= Auth::user();
        self::send($member, NotificationType::ProjectMemberAdded,
            ($actor?->firstName() ?? 'Someone').' added you to the project "'.$project->name.'"',
            null, route('projects.show', $project), $project, actor: $actor);
    }

    public static function taskCompleted(Task $task, ?User $actor = null): void
    {
        $actor ??= Auth::user();
        $recipients = collect($task->stakeholderIds())->push($task->project->owner_id);
        self::send($recipients, NotificationType::TaskCompleted,
            '"'.$task->title.'" was completed',
            ($actor ? 'Completed by '.$actor->name.' · ' : '').'Project: '.$task->project->name,
            route('tasks.show', $task), $task, actor: $actor);
    }

    public static function taskDelayed(Task $task): void
    {
        $recipients = collect($task->stakeholderIds())->push($task->project->owner_id);
        self::send($recipients, NotificationType::TaskDelayed,
            '"'.$task->title.'" is now delayed',
            'It was due '.$task->due_date?->format('M j, Y').' · Project: '.$task->project->name,
            route('tasks.show', $task), $task, actor: null);
    }

    public static function deadlineApproaching(Task $task): void
    {
        $recipients = collect([$task->assignee_id])->merge($task->collaborators()->pluck('users.id'));
        self::send($recipients, NotificationType::DeadlineApproaching,
            '"'.$task->title.'" — '.Str::lower($task->dueLabel() ?? 'due soon'),
            'Progress: '.$task->progress.'% · Project: '.$task->project->name,
            route('tasks.show', $task), $task, ['due_date' => $task->due_date?->toDateString()], actor: null);
    }

    /**
     * Notify users @mentioned in a piece of text (comment or remark).
     * Mentions use the user's username, e.g. "@jane.doe".
     *
     * @return Collection<int, User> users that were mentioned
     */
    public static function mentions(string $text, Task $task, ?Model $subject = null, ?User $actor = null): Collection
    {
        $actor ??= Auth::user();
        // Only people who can actually open the task are notified.
        $users = self::parseMentions($text)->filter(fn (User $u) => $u->can('view', $task))->values();
        if ($users->isEmpty()) {
            return $users;
        }

        self::send($users, NotificationType::Mentioned,
            ($actor?->firstName() ?? 'Someone').' mentioned you on "'.$task->title.'"',
            Str::limit(strip_tags($text), 160),
            route('tasks.show', $task), $subject ?? $task, actor: $actor);

        return $users;
    }

    /** @return Collection<int, User> */
    public static function parseMentions(string $text): Collection
    {
        preg_match_all('/(?<![\w.])@([a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9])/i', $text, $matches);
        $usernames = collect($matches[1] ?? [])->map(fn ($u) => Str::lower($u))->unique();

        if ($usernames->isEmpty()) {
            return collect();
        }

        return User::query()->active()->whereIn('username', $usernames)->get();
    }
}

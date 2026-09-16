<?php

namespace App\Enums;

enum NotificationType: string
{
    case TaskAssigned = 'task_assigned';
    case CollaboratorAdded = 'collaborator_added';
    case ProjectMemberAdded = 'project_member_added';
    case DeadlineApproaching = 'deadline_approaching';
    case TaskDelayed = 'task_delayed';
    case TaskCompleted = 'task_completed';
    case Mentioned = 'mentioned';
    case CommentAdded = 'comment_added';
    case DailyDigest = 'daily_digest';

    public function label(): string
    {
        return match ($this) {
            self::TaskAssigned => 'Assigned to you',
            self::CollaboratorAdded => 'Added as collaborator',
            self::ProjectMemberAdded => 'Added to project',
            self::DeadlineApproaching => 'Deadline approaching',
            self::TaskDelayed => 'Task delayed',
            self::TaskCompleted => 'Task completed',
            self::Mentioned => 'Mentioned you',
            self::CommentAdded => 'New comment',
            self::DailyDigest => 'Daily briefing',
        };
    }

    /** Heroicon-style name used by <x-icon>. */
    public function icon(): string
    {
        return match ($this) {
            self::TaskAssigned => 'user-plus',
            self::CollaboratorAdded => 'users',
            self::ProjectMemberAdded => 'folder',
            self::DeadlineApproaching => 'clock',
            self::TaskDelayed => 'alert',
            self::TaskCompleted => 'check-circle',
            self::Mentioned => 'at',
            self::DailyDigest => 'sparkles',
            self::CommentAdded => 'chat',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::TaskAssigned, self::ProjectMemberAdded => 'indigo',
            self::CollaboratorAdded => 'violet',
            self::DeadlineApproaching => 'amber',
            self::TaskDelayed => 'red',
            self::TaskCompleted => 'emerald',
            self::Mentioned, self::CommentAdded => 'sky',
            self::DailyDigest => 'violet',
        };
    }
}

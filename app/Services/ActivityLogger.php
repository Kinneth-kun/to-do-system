<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

/**
 * Records key events for the admin Activity Log.
 *
 * Action naming convention: "<category>.<verb>", e.g.
 *   auth.login, auth.logout, auth.failed, auth.locked
 *   project.created, project.updated, project.deleted, project.status_changed
 *   project.member_added, project.member_removed
 *   task.created, task.updated, task.status_changed, task.progress_updated, task.completed,
 *   task.delayed, task.assigned, task.deleted
 *   collaborator.added, collaborator.removed, comment.added, comment.deleted,
 *   attachment.uploaded, attachment.deleted
 *   user.created, user.updated, user.activated, user.deactivated, user.unlocked, user.password_reset
 *   settings.updated
 */
class ActivityLogger
{
    public static function log(string $action, string $description, ?Model $subject = null, array $properties = [], ?User $user = null): ActivityLog
    {
        $user ??= Auth::user();

        return ActivityLog::query()->create([
            'user_id' => $user?->id,
            'action' => $action,
            'description' => mb_strimwidth($description, 0, 250, '…'),
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'properties' => $properties ?: null,
            'ip_address' => app()->runningInConsole() ? null : Request::ip(),
            'user_agent' => app()->runningInConsole() ? null : mb_strimwidth((string) Request::userAgent(), 0, 500),
            'created_at' => now(),
        ]);
    }
}

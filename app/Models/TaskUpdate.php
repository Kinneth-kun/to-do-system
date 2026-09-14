<?php

namespace App\Models;

use App\Enums\TaskStatus;
use App\Enums\TaskUpdateType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Append-only history entry. Updating or deleting an existing row is forbidden
 * (business rule: historical update retention).
 */
class TaskUpdate extends Model
{
    protected $fillable = [
        'task_id',
        'user_id',
        'type',
        'old_status',
        'new_status',
        'old_progress',
        'new_progress',
        'remark',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'type' => TaskUpdateType::class,
            'old_status' => TaskStatus::class,
            'new_status' => TaskStatus::class,
            'old_progress' => 'integer',
            'new_progress' => 'integer',
            'meta' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Task updates are immutable.'));
        static::deleting(fn () => throw new LogicException('Task updates are immutable.'));
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function statusChanged(): bool
    {
        return $this->new_status !== null && $this->old_status !== $this->new_status;
    }

    public function progressChanged(): bool
    {
        return $this->new_progress !== null && $this->old_progress !== $this->new_progress;
    }

    public function actorName(): string
    {
        return $this->user?->name ?? 'System';
    }
}

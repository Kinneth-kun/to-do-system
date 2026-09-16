<?php

namespace App\Models;

use App\Enums\Department;
use App\Enums\Priority;
use App\Enums\TaskStatus;
use App\Services\Settings;
use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Persist status/progress changes through App\Services\TaskService so that history,
 * roll-ups, notifications and activity logs stay consistent.
 */
class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'project_id',
        'parent_id',
        'title',
        'description',
        'status',
        'status_before_delay',
        'priority',
        'progress',
        'assignee_id',
        'created_by',
        'start_date',
        'due_date',
        'completed_at',
        'delayed_at',
        'latest_remark',
        'latest_update_at',
        'latest_update_by',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'status' => TaskStatus::class,
            'status_before_delay' => TaskStatus::class,
            'priority' => Priority::class,
            'progress' => 'integer',
            'start_date' => 'date',
            'due_date' => 'date',
            'completed_at' => 'datetime',
            'delayed_at' => 'datetime',
            'latest_update_at' => 'datetime',
        ];
    }

    /* ----------------------------------------------------------------- Relations */

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'parent_id');
    }

    public function subtasks(): HasMany
    {
        return $this->hasMany(Task::class, 'parent_id')->orderBy('position')->orderBy('id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function latestUpdater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'latest_update_by');
    }

    public function collaborators(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'task_collaborators')
            ->withPivot('added_by')
            ->withTimestamps();
    }

    /** Full, append-only update history (newest first). */
    public function updates(): HasMany
    {
        return $this->hasMany(TaskUpdate::class)->latest()->latest('id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(TaskComment::class)->oldest();
    }

    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable')->latest();
    }

    /* ----------------------------------------------------------------- Scopes */

    public function scopeTopLevel(Builder $query): Builder
    {
        return $query->whereNull('parent_id');
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', TaskStatus::openValues());
    }

    public function scopeStatus(Builder $query, TaskStatus|string $status): Builder
    {
        return $query->where('status', $status instanceof TaskStatus ? $status->value : $status);
    }

    /** Assigned to, collaborating on, or created by the user. */
    public function scopeInvolving(Builder $query, User $user): Builder
    {
        return $query->where(function (Builder $q) use ($user) {
            $q->where('assignee_id', $user->id)
                ->orWhere('created_by', $user->id)
                ->orWhereHas('collaborators', fn (Builder $c) => $c->where('users.id', $user->id));
        });
    }

    /** Tasks in projects visible to the user. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->isAdmin()) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($user) {
            $q->whereHas('project', fn (Builder $p) => $p->visibleTo($user))
                ->orWhere('assignee_id', $user->id)
                ->orWhereHas('collaborators', fn (Builder $c) => $c->where('users.id', $user->id));
        });
    }

    /** Tasks whose primary assignee belongs to a department. */
    public function scopeForDepartment(Builder $query, Department|string $department): Builder
    {
        $value = $department instanceof Department ? $department->value : $department;

        return $query->whereHas('assignee', fn (Builder $user) => $user->where('department', $value));
    }

    /** Open tasks due today .. today + N days (N from settings when null). */
    public function scopeDueSoon(Builder $query, ?int $days = null): Builder
    {
        $days ??= Settings::int('deadline.due_soon_days');

        return $query->open()
            ->where('status', '!=', TaskStatus::Delayed->value)
            ->whereNotNull('due_date')
            ->whereDate('due_date', '>=', today())
            ->whereDate('due_date', '<=', today()->addDays($days));
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->open()->whereNotNull('due_date')->whereDate('due_date', '<', today());
    }

    /** Tasks whose [start_date or due_date] range intersects [from, to]. Used by the calendar. */
    public function scopeBetweenDates(Builder $query, $from, $to): Builder
    {
        // A task spans [start_date ?? due_date, due_date].
        return $query->where(function (Builder $q) use ($from, $to) {
            $q->where(function (Builder $r) use ($from, $to) {
                $r->whereNotNull('due_date')
                    ->whereDate('due_date', '>=', $from)
                    ->where(function (Builder $s) use ($to) {
                        $s->where(fn (Builder $n) => $n->whereNull('start_date')->whereDate('due_date', '<=', $to))
                            ->orWhere(fn (Builder $n) => $n->whereNotNull('start_date')->whereDate('start_date', '<=', $to));
                    });
            })->orWhere(function (Builder $r) use ($from, $to) {
                $r->whereNull('due_date')->whereNotNull('start_date')
                    ->whereDate('start_date', '>=', $from)->whereDate('start_date', '<=', $to);
            });
        });
    }

    /* ----------------------------------------------------------------- Helpers */

    public function isSubtask(): bool
    {
        return $this->parent_id !== null;
    }

    public function isOverdue(): bool
    {
        return $this->due_date !== null && $this->due_date->lt(today()) && $this->status->isOpen();
    }

    public function isDueSoon(): bool
    {
        if ($this->due_date === null || ! $this->status->isOpen() || $this->status === TaskStatus::Delayed) {
            return false;
        }

        return $this->due_date->betweenIncluded(today(), today()->addDays(Settings::int('deadline.due_soon_days')));
    }

    /** Human "due in 3 days" / "2 days overdue" / "due today". */
    public function dueLabel(): ?string
    {
        if ($this->due_date === null) {
            return null;
        }

        $diff = (int) today()->diffInDays($this->due_date, false);

        return match (true) {
            $diff === 0 => 'Due today',
            $diff === 1 => 'Due tomorrow',
            $diff > 1 => "Due in {$diff} days",
            $diff === -1 => '1 day overdue',
            default => abs($diff).' days overdue',
        };
    }

    public function isCollaborator(User $user): bool
    {
        if ($this->relationLoaded('collaborators')) {
            return $this->collaborators->contains('id', $user->id);
        }

        return $this->collaborators()->where('users.id', $user->id)->exists();
    }

    /** Assignee, collaborators, creator — the people who care about this task. */
    public function stakeholderIds(): array
    {
        return collect([$this->assignee_id, $this->created_by])
            ->merge($this->collaborators()->pluck('users.id'))
            ->filter()->unique()->values()->all();
    }
}

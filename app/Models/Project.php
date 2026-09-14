<?php

namespace App\Models;

use App\Enums\Priority;
use App\Enums\ProjectHealth;
use App\Enums\ProjectMemberRole;
use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use HasFactory, SoftDeletes;

    public const COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'teal', 'fuchsia', 'orange', 'cyan'];

    protected $fillable = [
        'name',
        'description',
        'owner_id',
        'created_by',
        'status',
        'priority',
        'color',
        'start_date',
        'due_date',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => ProjectStatus::class,
            'priority' => Priority::class,
            'health' => ProjectHealth::class,
            'start_date' => 'date',
            'due_date' => 'date',
            'completed_at' => 'datetime',
            'progress' => 'integer',
        ];
    }

    /* ----------------------------------------------------------------- Relations */

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'project_members')
            ->withPivot(['role', 'added_by'])
            ->withTimestamps();
    }

    /** All tasks, including subtasks. */
    public function allTasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    /** Top-level tasks only. */
    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class)->whereNull('parent_id');
    }

    /* ----------------------------------------------------------------- Scopes */

    /** Projects a user may see: admins see all; others see owned or member projects. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->isAdmin()) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($user) {
            $q->where('owner_id', $user->id)
                ->orWhere('created_by', $user->id)
                ->orWhereHas('members', fn (Builder $m) => $m->where('users.id', $user->id));
        });
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', ProjectStatus::Active->value);
    }

    /* ----------------------------------------------------------------- Helpers */

    /** Per-instance cache of membership roles: user_id => role value|null. Avoids N+1 in policy checks. */
    protected array $membershipCache = [];

    public function isMember(User $user): bool
    {
        return $this->owner_id === $user->id || $this->memberRole($user) !== null;
    }

    public function isManager(User $user): bool
    {
        return $this->owner_id === $user->id || $this->memberRole($user) === ProjectMemberRole::Manager->value;
    }

    public function flushMembershipCache(): void
    {
        $this->membershipCache = [];
        $this->unsetRelation('members');
    }

    /** The user's pivot role in this project ("manager" / "member"), or null if not a member. */
    public function memberRole(User $user): ?string
    {
        if (array_key_exists($user->id, $this->membershipCache)) {
            return $this->membershipCache[$user->id];
        }

        if ($this->relationLoaded('members')) {
            $role = $this->members->firstWhere('id', $user->id)?->pivot?->role;
        } else {
            $role = $this->members()->where('users.id', $user->id)->first()?->pivot?->role;
        }

        return $this->membershipCache[$user->id] = $role;
    }

    /** Idempotently add a user as a project member. Returns true if newly added. */
    public function addMember(User|int $user, ?User $addedBy = null, ProjectMemberRole $role = ProjectMemberRole::Member): bool
    {
        $userId = $user instanceof User ? $user->id : $user;

        if ($this->members()->where('users.id', $userId)->exists()) {
            return false;
        }

        $this->members()->attach($userId, ['role' => $role->value, 'added_by' => $addedBy?->id]);
        $this->membershipCache = [];
        $this->unsetRelation('members');

        return true;
    }

    public function isOverdue(): bool
    {
        return $this->due_date !== null
            && $this->due_date->lt(today())
            && ! in_array($this->status, [ProjectStatus::Completed, ProjectStatus::Cancelled], true);
    }

    /** @return array<string,int> keyed by TaskStatus value, plus 'total' */
    public function taskCounts(bool $includeSubtasks = true): array
    {
        $query = $includeSubtasks ? $this->allTasks() : $this->tasks();
        $counts = $query->toBase()->selectRaw('status, count(*) as c')->groupBy('status')->pluck('c', 'status');

        $result = [];
        foreach (TaskStatus::cases() as $status) {
            $result[$status->value] = (int) ($counts[$status->value] ?? 0);
        }
        $result['total'] = array_sum($result);

        return $result;
    }
}

<?php

namespace App\Models;

use App\Enums\Department;
use App\Enums\TaskStatus;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Str;

/**
 * Note: this model intentionally does NOT use Laravel's Notifiable trait —
 * the `notifications` table belongs to the in-app App\Models\Notification center.
 */
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory;

    public const AVATAR_COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'teal', 'fuchsia', 'orange', 'cyan'];

    protected $fillable = [
        'role_id',
        'name',
        'username',
        'email',
        'job_title',
        'department',
        'avatar_color',
        'is_active',
        'password',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'department' => Department::class,
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'failed_login_attempts' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (User $user) {
            if (blank($user->username)) {
                $user->username = static::generateUsername($user->name ?: Str::before($user->email, '@'));
            }
            if (blank($user->avatar_color)) {
                $user->avatar_color = static::AVATAR_COLORS[crc32((string) $user->email) % count(static::AVATAR_COLORS)];
            }
            if (blank($user->role_id)) {
                $user->role_id = Role::idFor(Role::USER);
            }
        });
    }

    public static function generateUsername(string $seed): string
    {
        $base = Str::of($seed)->ascii()->lower()->replaceMatches('/[^a-z0-9]+/', '.')->trim('.')->limit(24, '')->value() ?: 'user';
        $username = $base;
        $i = 1;
        while (static::query()->where('username', $username)->exists()) {
            $username = $base.(++$i);
        }

        return $username;
    }

    /* ----------------------------------------------------------------- Relations */

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function ownedProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'owner_id');
    }

    public function projects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_members')
            ->withPivot(['role', 'added_by'])
            ->withTimestamps();
    }

    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assignee_id');
    }

    public function createdTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'created_by');
    }

    public function collaboratingTasks(): BelongsToMany
    {
        return $this->belongsToMany(Task::class, 'task_collaborators')
            ->withPivot('added_by')
            ->withTimestamps();
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class)->latest();
    }

    public function unreadNotifications(): HasMany
    {
        return $this->notifications()->whereNull('read_at');
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    /* ----------------------------------------------------------------- Helpers */

    public function isAdmin(): bool
    {
        return $this->role?->name === Role::ADMIN;
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    public function initials(): string
    {
        return Str::of($this->name)->explode(' ')->filter()->take(2)
            ->map(fn ($p) => Str::upper(Str::substr($p, 0, 1)))->implode('') ?: '?';
    }

    public function firstName(): string
    {
        return Str::before($this->name, ' ') ?: $this->name;
    }

    /** Tasks this user is responsible for or collaborating on. */
    public function involvedTasksQuery(): Builder
    {
        return Task::query()->involving($this);
    }

    public function openAssignedCount(): int
    {
        return $this->assignedTasks()->whereIn('status', TaskStatus::openValues())->count();
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeDepartment(Builder $query, Department|string $department): Builder
    {
        return $query->where('department', $department instanceof Department ? $department->value : $department);
    }

    public function scopeAdmins(Builder $query): Builder
    {
        return $query->whereHas('role', fn ($q) => $q->where('name', Role::ADMIN));
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    public const ADMIN = 'admin';
    public const USER = 'user';

    protected $fillable = ['name', 'label', 'description'];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public static function idFor(string $name): int
    {
        return (int) static::query()->firstOrCreate(['name' => $name], [
            'label' => $name === self::ADMIN ? 'Administrator' : 'User',
            'description' => $name === self::ADMIN
                ? 'Full access: user management, oversight of all projects, activity logs, executive dashboard and settings.'
                : 'Manages assigned work, creates projects and tasks, and collaborates with others.',
        ])->id;
    }
}

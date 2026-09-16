<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * System settings with typed defaults. Admins edit these on the Settings page.
 *
 *   Settings::int('deadline.due_soon_days')
 *   Settings::set(['health.at_risk_delayed_percent' => 10])
 */
class Settings
{
    private const CACHE_KEY = 'taskflow.settings';

    /**
     * key => [default, type, label, help, group, min, max]
     */
    public const DEFINITIONS = [
        'general.app_name' => ['default' => 'TaskFlow', 'type' => 'string', 'group' => 'General', 'label' => 'Application name', 'help' => 'Shown in the sidebar and browser title.'],
        'general.organization' => ['default' => 'My Organization', 'type' => 'string', 'group' => 'General', 'label' => 'Organization name', 'help' => 'Shown on the executive dashboard and meeting view.'],

        'deadline.due_soon_days' => ['default' => 3, 'type' => 'int', 'min' => 1, 'max' => 30, 'group' => 'Deadlines', 'label' => '"Due soon" window (days)', 'help' => 'Open tasks due within this many days are flagged as due soon and trigger deadline notifications.'],
        'deadline.auto_delay_enabled' => ['default' => true, 'type' => 'bool', 'group' => 'Deadlines', 'label' => 'Automatically mark overdue tasks as Delayed', 'help' => 'Pending and In Progress tasks past their due date become Delayed.'],

        'health.at_risk_delayed_percent' => ['default' => 1, 'type' => 'int', 'min' => 1, 'max' => 100, 'group' => 'Project health', 'label' => 'At Risk when delayed tasks ≥ (%)', 'help' => 'Share of open tasks that are delayed before a project is At Risk. 1 = any delayed task.'],
        'health.delayed_delayed_percent' => ['default' => 25, 'type' => 'int', 'min' => 1, 'max' => 100, 'group' => 'Project health', 'label' => 'Delayed when delayed tasks ≥ (%)', 'help' => 'Share of open tasks that are delayed before a project is Delayed.'],
        'health.progress_gap_percent' => ['default' => 20, 'type' => 'int', 'min' => 5, 'max' => 100, 'group' => 'Project health', 'label' => 'At Risk when behind schedule by ≥ (points)', 'help' => 'Compares actual progress to expected progress based on elapsed time between start and due date.'],
        'health.due_soon_progress_percent' => ['default' => 75, 'type' => 'int', 'min' => 0, 'max' => 100, 'group' => 'Project health', 'label' => 'At Risk when due soon and progress below (%)', 'help' => 'A project inside the due-soon window with progress below this is At Risk.'],
        'health.overdue_project_is_delayed' => ['default' => true, 'type' => 'bool', 'group' => 'Project health', 'label' => 'Project past its due date is Delayed', 'help' => 'An unfinished project past its own due date is always Delayed.'],

        'digest.enabled' => ['default' => true, 'type' => 'bool', 'group' => 'Daily briefing', 'label' => 'Send the 8:00 am briefing', 'help' => 'A summary of overdue, due-today and upcoming work, delivered every weekday morning.'],
        'digest.include_quiet_days' => ['default' => false, 'type' => 'bool', 'group' => 'Daily briefing', 'label' => 'Send even when there is nothing open', 'help' => 'Off by default, so a clear day produces no notification.'],
        'ai.briefings_enabled' => ['default' => true, 'type' => 'bool', 'group' => 'Daily briefing', 'label' => 'Write the summary with AI', 'help' => 'Uses Claude to turn the numbers into a short briefing. Needs ANTHROPIC_API_KEY; without it a plain summary is sent instead.'],

        'security.max_login_attempts' => ['default' => 5, 'type' => 'int', 'min' => 3, 'max' => 20, 'group' => 'Security', 'label' => 'Failed logins before lockout', 'help' => 'Consecutive failed sign-ins before the account is temporarily locked.'],
        'security.lockout_minutes' => ['default' => 15, 'type' => 'int', 'min' => 1, 'max' => 1440, 'group' => 'Security', 'label' => 'Lockout duration (minutes)', 'help' => 'How long a locked account stays locked. Admins can unlock sooner.'],
    ];

    /** @return array<string, mixed> */
    public static function all(): array
    {
        $stored = Cache::rememberForever(self::CACHE_KEY, function () {
            try {
                if (! Schema::hasTable('settings')) {
                    return [];
                }

                return Setting::query()->pluck('value', 'key')->all();
            } catch (Throwable) {
                return [];
            }
        });

        $values = [];
        foreach (self::DEFINITIONS as $key => $def) {
            $values[$key] = array_key_exists($key, $stored)
                ? self::cast($stored[$key], $def['type'])
                : $def['default'];
        }

        return $values;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::all()[$key] ?? $default ?? (self::DEFINITIONS[$key]['default'] ?? null);
    }

    public static function int(string $key): int
    {
        return (int) self::get($key);
    }

    public static function bool(string $key): bool
    {
        return (bool) self::get($key);
    }

    public static function string(string $key): string
    {
        return (string) self::get($key);
    }

    /** @param array<string, mixed> $values */
    public static function set(array $values): void
    {
        foreach ($values as $key => $value) {
            if (! isset(self::DEFINITIONS[$key])) {
                continue;
            }
            $type = self::DEFINITIONS[$key]['type'];
            $stored = match ($type) {
                'bool' => $value ? '1' : '0',
                default => (string) $value,
            };
            Setting::query()->updateOrCreate(['key' => $key], ['value' => $stored]);
        }

        self::flush();
    }

    public static function flush(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /** @return array<string, array<string, array>> group => key => definition (with current value) */
    public static function grouped(): array
    {
        $values = self::all();
        $groups = [];
        foreach (self::DEFINITIONS as $key => $def) {
            $groups[$def['group']][$key] = $def + ['value' => $values[$key]];
        }

        return $groups;
    }

    private static function cast(mixed $value, string $type): mixed
    {
        return match ($type) {
            'int' => (int) $value,
            'bool' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            default => (string) $value,
        };
    }
}

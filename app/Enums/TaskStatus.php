<?php

namespace App\Enums;

enum TaskStatus: string
{
    case Pending = 'pending';
    case InProgress = 'in_progress';
    case Completed = 'completed';
    case Delayed = 'delayed';
    case OnHold = 'on_hold';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::InProgress => 'In Progress',
            self::Completed => 'Completed',
            self::Delayed => 'Delayed',
            self::OnHold => 'On Hold',
            self::Cancelled => 'Cancelled',
        };
    }

    /** Tailwind colour family used by badges, dots and calendar chips. */
    public function color(): string
    {
        return match ($this) {
            self::Pending => 'slate',
            self::InProgress => 'blue',
            self::Completed => 'emerald',
            self::Delayed => 'red',
            self::OnHold => 'amber',
            self::Cancelled => 'zinc',
        };
    }

    /** Statuses that count as "open work" (can still become delayed / due soon). */
    public function isOpen(): bool
    {
        return in_array($this, [self::Pending, self::InProgress, self::Delayed], true);
    }

    /** Statuses eligible for the automatic delay check. */
    public function canAutoDelay(): bool
    {
        return in_array($this, [self::Pending, self::InProgress], true);
    }

    /** Progress-driven status per spec: 0% Pending, 1–99% In Progress, 100% Completed. */
    public static function fromProgress(int $progress): self
    {
        return match (true) {
            $progress <= 0 => self::Pending,
            $progress >= 100 => self::Completed,
            default => self::InProgress,
        };
    }

    /** @return array<string, string> value => label */
    public static function options(): array
    {
        return collect(self::cases())->mapWithKeys(fn (self $s) => [$s->value => $s->label()])->all();
    }

    /** @return list<string> */
    public static function openValues(): array
    {
        return [self::Pending->value, self::InProgress->value, self::Delayed->value];
    }
}

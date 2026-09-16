<?php

namespace App\Enums;

/**
 * Organizational departments. A user belongs to one, which is how their work
 * is identified on tasks (see the department filter on My Tasks and the
 * department breakdown on the executive dashboard).
 */
enum Department: string
{
    case HumanResources = 'human_resources';
    case Leasing = 'leasing';
    case Marketing = 'marketing';
    case Security = 'security';
    case Operations = 'operations';
    case InformationTechnology = 'information_technology';
    case Accounting = 'accounting';

    public function label(): string
    {
        return match ($this) {
            self::HumanResources => 'Human Resources',
            self::Leasing => 'Leasing',
            self::Marketing => 'Marketing',
            self::Security => 'Security',
            self::Operations => 'Operations',
            self::InformationTechnology => 'Information Technology',
            self::Accounting => 'Accounting',
        };
    }

    /** Short code for compact badges and avatars. */
    public function code(): string
    {
        return match ($this) {
            self::HumanResources => 'HR',
            self::Leasing => 'LSG',
            self::Marketing => 'MKT',
            self::Security => 'SEC',
            self::Operations => 'OPS',
            self::InformationTechnology => 'IT',
            self::Accounting => 'ACC',
        };
    }

    /** Tailwind colour family used by badges. */
    public function color(): string
    {
        return match ($this) {
            self::HumanResources => 'rose',
            self::Leasing => 'amber',
            self::Marketing => 'fuchsia',
            self::Security => 'slate',
            self::Operations => 'indigo',
            self::InformationTechnology => 'sky',
            self::Accounting => 'emerald',
        };
    }

    public function icon(): string
    {
        return match ($this) {
            self::HumanResources => 'users',
            self::Leasing => 'folder',
            self::Marketing => 'sparkles',
            self::Security => 'lock',
            self::Operations => 'cog',
            self::InformationTechnology => 'grid',
            self::Accounting => 'chart',
        };
    }

    /** @return array<string, string> value => label, for select inputs. */
    public static function options(): array
    {
        return collect(self::cases())->mapWithKeys(fn (self $d) => [$d->value => $d->label()])->all();
    }

    /**
     * Best-effort mapping of free-text department names onto the official list.
     * Used by the migration and when importing users.
     */
    public static function fromLabel(?string $value): ?self
    {
        if (blank($value)) {
            return null;
        }

        $normalized = strtolower(trim((string) $value));

        if ($exact = self::tryFrom(str_replace([' ', '-'], '_', $normalized))) {
            return $exact;
        }

        return match (true) {
            str_contains($normalized, 'human') || in_array($normalized, ['hr', 'people', 'personnel'], true) => self::HumanResources,
            str_contains($normalized, 'leas') || str_contains($normalized, 'tenant') || str_contains($normalized, 'property') => self::Leasing,
            str_contains($normalized, 'market') || str_contains($normalized, 'brand') || str_contains($normalized, 'design') || str_contains($normalized, 'creative') => self::Marketing,
            str_contains($normalized, 'secur') || str_contains($normalized, 'safety') || str_contains($normalized, 'guard') => self::Security,
            str_contains($normalized, 'account') || str_contains($normalized, 'financ') || str_contains($normalized, 'payroll') || str_contains($normalized, 'audit') => self::Accounting,
            str_contains($normalized, 'it') || str_contains($normalized, 'tech') || str_contains($normalized, 'engineer') || str_contains($normalized, 'software') || str_contains($normalized, 'develop') || str_contains($normalized, 'data') => self::InformationTechnology,
            str_contains($normalized, 'oper') || str_contains($normalized, 'admin') || str_contains($normalized, 'management') || str_contains($normalized, 'facilit') => self::Operations,
            default => null,
        };
    }
}

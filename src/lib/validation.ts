import { isValidDate } from './dates';

/*
 * Form validation with Laravel's rule semantics and messages ("The title field is required.").
 * Empty strings become null, like Laravel's ConvertEmptyStringsToNull middleware.
 *
 *   const v = new Validator(formData);
 *   const title = v.string('title', { required: true, max: 255 });
 *   const due = v.date('due_date', { afterOrEqual: 'start_date' });
 *   if (v.fails()) return v.state();
 */

export type FormValues = Record<string, string | string[]>;
export type FormState = { ok?: boolean; errors?: Record<string, string>; values?: FormValues; message?: string } | null;

const attr = (field: string) => field.replace(/_/g, ' ');

type Common = { required?: boolean; label?: string };

export class Validator {
    readonly errors: Record<string, string> = {};
    private readonly values: Record<string, unknown> = {};

    constructor(private readonly data: FormData) {}

    /** Raw value: trimmed string, or null when missing/empty. */
    raw(field: string): string | null {
        const value = this.data.get(field);
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    }

    has(field: string): boolean {
        return this.data.has(field);
    }

    fail(field: string, message: string): void {
        this.errors[field] ??= message;
    }

    private name(field: string, opts: Common): string {
        return opts.label ?? attr(field);
    }

    private requiredCheck(field: string, value: unknown, opts: Common): boolean {
        if (value === null || value === undefined) {
            if (opts.required) this.fail(field, `The ${this.name(field, opts)} field is required.`);
            return false;
        }
        return true;
    }

    string(field: string, opts: Common & { max?: number; min?: number; regex?: RegExp; email?: boolean; keepWhitespace?: boolean } = {}): string | null {
        const rawValue = this.data.get(field);
        const value = opts.keepWhitespace && typeof rawValue === 'string' && rawValue !== '' ? rawValue : this.raw(field);
        if (!this.requiredCheck(field, value, opts)) return (this.values[field] = null);
        const s = value as string;
        const name = this.name(field, opts);
        if (opts.max !== undefined && s.length > opts.max) this.fail(field, `The ${name} field must not be greater than ${opts.max} characters.`);
        if (opts.min !== undefined && s.length < opts.min) this.fail(field, `The ${name} field must be at least ${opts.min} characters.`);
        if (opts.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) this.fail(field, `The ${name} field must be a valid email address.`);
        if (opts.regex && !opts.regex.test(s)) this.fail(field, `The ${name} field format is invalid.`);
        return (this.values[field] = s);
    }

    int(field: string, opts: Common & { min?: number; max?: number } = {}): number | null {
        const value = this.raw(field);
        if (!this.requiredCheck(field, value, opts)) return null;
        const name = this.name(field, opts);
        if (!/^-?\d+$/.test(value!)) {
            this.fail(field, `The ${name} field must be an integer.`);
            return null;
        }
        const n = Number(value);
        if (opts.min !== undefined && n < opts.min) this.fail(field, `The ${name} field must be at least ${opts.min}.`);
        if (opts.max !== undefined && n > opts.max) this.fail(field, `The ${name} field must not be greater than ${opts.max}.`);
        return (this.values[field] = n) as number;
    }

    /** One of a fixed set of values (Laravel's `in:` / `Rule::enum`). */
    oneOf<T extends string>(field: string, allowed: readonly T[], opts: Common = {}): T | null {
        const value = this.raw(field);
        if (!this.requiredCheck(field, value, opts)) return null;
        if (!allowed.includes(value as T)) {
            this.fail(field, `The selected ${this.name(field, opts)} is invalid.`);
            return null;
        }
        return (this.values[field] = value) as T;
    }

    date(field: string, opts: Common & { afterOrEqual?: string } = {}): string | null {
        const value = this.raw(field);
        if (!this.requiredCheck(field, value, opts)) return (this.values[field] = null);
        const name = this.name(field, opts);
        if (!isValidDate(value)) {
            this.fail(field, `The ${name} field must be a valid date.`);
            return null;
        }
        if (opts.afterOrEqual) {
            const other = this.values[opts.afterOrEqual] ?? this.raw(opts.afterOrEqual);
            if (typeof other === 'string' && isValidDate(other) && value! < other) {
                this.fail(field, `The ${name} field must be a date after or equal to ${attr(opts.afterOrEqual)}.`);
            }
        }
        return (this.values[field] = value);
    }

    bool(field: string): boolean {
        const value = this.data.getAll(field).at(-1);
        return typeof value === 'string' && ['1', 'true', 'on', 'yes'].includes(value.toLowerCase());
    }

    ints(field: string): number[] {
        const values = this.data
            .getAll(field)
            .filter((v): v is string => typeof v === 'string' && /^\d+$/.test(v))
            .map(Number);
        return [...new Set(values)];
    }

    confirmed(field: string, opts: Common = {}): void {
        if (this.raw(field) !== null && this.data.get(field) !== this.data.get(`${field}_confirmation`)) {
            this.fail(field, `The ${this.name(field, opts)} field confirmation does not match.`);
        }
    }

    fails(): boolean {
        return Object.keys(this.errors).length > 0;
    }

    /** The form state to send back: errors plus what was submitted (never passwords). */
    state(extraErrors: Record<string, string> = {}): FormState {
        return { errors: { ...this.errors, ...extraErrors }, values: submittedValues(this.data) };
    }
}

export function submittedValues(data: FormData): FormValues {
    const values: FormValues = {};
    for (const key of new Set(data.keys())) {
        if (key.startsWith('$ACTION') || /password/i.test(key)) continue;
        const all = data.getAll(key).filter((v): v is string => typeof v === 'string');
        if (!all.length) continue;
        values[key] = key.endsWith('[]') || all.length > 1 ? all : all[0];
    }
    return values;
}

export function errorState(errors: Record<string, string>, data?: FormData): FormState {
    return { errors, values: data ? submittedValues(data) : undefined };
}

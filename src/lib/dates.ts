/*
 * Dates and times in the application's timezone.
 *
 * Laravel resolved today() in APP_TIMEZONE. Vercel functions run in UTC, so every "today",
 * "overdue" and "due soon" decision goes through these helpers instead of the server clock.
 *
 *  - Calendar dates (due_date, start_date) are plain 'YYYY-MM-DD' strings — no timezone at all.
 *  - Instants (created_at, read_at…) are Date objects, shown in APP_TIMEZONE.
 *
 * Formatting uses PHP's date() letters (M j, Y · g:i A …) so the views read like the originals.
 */

export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'UTC';

let testNow: Date | null = null;

/** Freeze "now" (tests and the demo seeder, like Carbon::setTestNow). Pass null to unfreeze. */
export function setTestNow(date: Date | null): void {
    testNow = date;
}

export function now(): Date {
    return testNow ? new Date(testNow) : new Date();
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
});

/** Wall-clock parts of an instant in APP_TIMEZONE. */
export function zonedParts(date: Date): Parts {
    const map: Record<string, number> = {};
    for (const part of partsFormatter.formatToParts(date)) {
        if (part.type !== 'literal') map[part.type] = Number(part.value);
    }
    const weekday = new Date(Date.UTC(map.year, map.month - 1, map.day)).getUTCDay();
    return { year: map.year, month: map.month, day: map.day, hour: map.hour % 24, minute: map.minute, second: map.second, weekday };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** 'YYYY-MM-DD' of an instant in APP_TIMEZONE. */
export function toDateString(date: Date): string {
    const p = zonedParts(date);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The instant at which the wall clock in APP_TIMEZONE reads `date` `hour`:`minute`. */
export function fromZoned(date: string, hour = 0, minute = 0): Date {
    const [y, m, d] = date.split('-').map(Number);
    const guess = Date.UTC(y, m - 1, d, hour, minute);
    const p = zonedParts(new Date(guess));
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
    return new Date(guess - offset);
}

/** Today's calendar date in APP_TIMEZONE. */
export function today(): string {
    return toDateString(now());
}

function dateParts(date: string): Parts {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    return { year: y, month: m, day: d, hour: 0, minute: 0, second: 0, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function fromUtcDays(ms: number): string {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const utcMs = (date: string) => {
    const p = dateParts(date);
    return Date.UTC(p.year, p.month - 1, p.day);
};

export function addDays(date: string, days: number): string {
    return fromUtcDays(utcMs(date) + days * 86_400_000);
}

export function addMonths(date: string, months: number): string {
    const p = dateParts(date);
    const target = new Date(Date.UTC(p.year, p.month - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return fromUtcDays(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(p.day, lastDay)));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffInDays(from: string, to: string): number {
    return Math.round((utcMs(to) - utcMs(from)) / 86_400_000);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
    const w = dateParts(date).weekday;
    return w === 0 ? 7 : w;
}

export const startOfWeek = (date: string) => addDays(date, 1 - isoWeekday(date)); // Monday
export const endOfWeek = (date: string) => addDays(startOfWeek(date), 6); // Sunday
export const startOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
export const endOfMonth = (date: string) => addDays(addMonths(startOfMonth(date), 1), -1);

export function isValidDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const p = dateParts(value);
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
    return d.getUTCMonth() === p.month - 1 && d.getUTCDate() === p.day;
}

/* ------------------------------------------------------------------ Formatting */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Format like PHP's date(): d j D l N m n M F Y y H G h g i s A a, backslash escapes.
 * A string is a calendar date; a Date is an instant shown in APP_TIMEZONE.
 */
export function formatDate(value: string | Date | null | undefined, pattern: string): string {
    if (value == null) return '';
    const p = typeof value === 'string' ? dateParts(value) : zonedParts(value);
    const h12 = p.hour % 12 || 12;
    let out = '';
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === '\\') {
            out += pattern[++i] ?? '';
            continue;
        }
        switch (c) {
            case 'd': out += pad(p.day); break;
            case 'j': out += p.day; break;
            case 'D': out += DAYS[p.weekday].slice(0, 3); break;
            case 'l': out += DAYS[p.weekday]; break;
            case 'N': out += p.weekday === 0 ? 7 : p.weekday; break;
            case 'm': out += pad(p.month); break;
            case 'n': out += p.month; break;
            case 'M': out += MONTHS[p.month - 1].slice(0, 3); break;
            case 'F': out += MONTHS[p.month - 1]; break;
            case 'Y': out += p.year; break;
            case 'y': out += String(p.year).slice(-2); break;
            case 'H': out += pad(p.hour); break;
            case 'G': out += p.hour; break;
            case 'h': out += pad(h12); break;
            case 'g': out += h12; break;
            case 'i': out += pad(p.minute); break;
            case 's': out += pad(p.second); break;
            case 'A': out += p.hour < 12 ? 'AM' : 'PM'; break;
            case 'a': out += p.hour < 12 ? 'am' : 'pm'; break;
            default: out += c;
        }
    }
    return out;
}

/** Carbon's diffForHumans(): "5 minutes ago", "2 days from now". */
export function diffForHumans(date: Date | null | undefined, from: Date = now()): string {
    if (!date) return '';
    const seconds = Math.round((from.getTime() - date.getTime()) / 1000);
    const past = seconds >= 0;
    const abs = Math.abs(seconds);
    const units: [number, string][] = [
        [31_536_000, 'year'],
        [2_592_000, 'month'],
        [604_800, 'week'],
        [86_400, 'day'],
        [3_600, 'hour'],
        [60, 'minute'],
        [1, 'second'],
    ];
    for (const [size, unit] of units) {
        if (abs >= size || unit === 'second') {
            const n = Math.max(1, Math.floor(abs / size));
            return `${n} ${unit}${n === 1 ? '' : 's'} ${past ? 'ago' : 'from now'}`;
        }
    }
    return '';
}

/** Local hour (0–23) in APP_TIMEZONE, for greetings. */
export function currentHour(): number {
    return zonedParts(now()).hour;
}

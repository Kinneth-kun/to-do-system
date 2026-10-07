import { db, schema } from './db';
import { now } from './dates';

/*
 * System settings with typed defaults. Admins edit these on the Settings page.
 *
 *   await Settings.int('deadline.due_soon_days')
 *   await Settings.set({ 'health.at_risk_delayed_percent': 10 })
 *
 * Laravel cached these forever and flushed on save. Vercel runs many short-lived instances, so
 * values are cached per instance for a few seconds instead: a change made on one instance
 * reaches the others almost immediately, without a query on every read.
 */

type Definition = {
    default: string | number | boolean;
    type: 'string' | 'int' | 'bool';
    group: string;
    label: string;
    help: string;
    min?: number;
    max?: number;
};

export const SETTING_DEFINITIONS = {
    'general.app_name': { default: 'TaskFlow', type: 'string', group: 'General', label: 'Application name', help: 'Shown in the sidebar and browser title.' },
    'general.organization': { default: 'My Organization', type: 'string', group: 'General', label: 'Organization name', help: 'Shown on the executive dashboard and meeting view.' },

    'deadline.due_soon_days': { default: 3, type: 'int', min: 1, max: 30, group: 'Deadlines', label: '"Due soon" window (days)', help: 'Open tasks due within this many days are flagged as due soon and trigger deadline notifications.' },
    'deadline.auto_delay_enabled': { default: true, type: 'bool', group: 'Deadlines', label: 'Automatically mark overdue tasks as Delayed', help: 'Pending and In Progress tasks past their due date become Delayed.' },

    'health.at_risk_delayed_percent': { default: 1, type: 'int', min: 1, max: 100, group: 'Project health', label: 'At Risk when delayed tasks ≥ (%)', help: 'Share of open tasks that are delayed before a project is At Risk. 1 = any delayed task.' },
    'health.delayed_delayed_percent': { default: 25, type: 'int', min: 1, max: 100, group: 'Project health', label: 'Delayed when delayed tasks ≥ (%)', help: 'Share of open tasks that are delayed before a project is Delayed.' },
    'health.progress_gap_percent': { default: 20, type: 'int', min: 5, max: 100, group: 'Project health', label: 'At Risk when behind schedule by ≥ (points)', help: 'Compares actual progress to expected progress based on elapsed time between start and due date.' },
    'health.due_soon_progress_percent': { default: 75, type: 'int', min: 0, max: 100, group: 'Project health', label: 'At Risk when due soon and progress below (%)', help: 'A project inside the due-soon window with progress below this is At Risk.' },
    'health.overdue_project_is_delayed': { default: true, type: 'bool', group: 'Project health', label: 'Project past its due date is Delayed', help: 'An unfinished project past its own due date is always Delayed.' },

    'digest.enabled': { default: true, type: 'bool', group: 'Daily briefing', label: 'Send the 8:00 am briefing', help: 'A summary of overdue, due-today and upcoming work, delivered every weekday morning.' },
    'digest.include_quiet_days': { default: false, type: 'bool', group: 'Daily briefing', label: 'Send even when there is nothing open', help: 'Off by default, so a clear day produces no notification.' },
    'ai.briefings_enabled': { default: true, type: 'bool', group: 'Daily briefing', label: 'Write the summary with AI', help: 'Uses Claude to turn the numbers into a short briefing. Needs ANTHROPIC_API_KEY; without it a plain summary is sent instead.' },

    'security.max_login_attempts': { default: 5, type: 'int', min: 3, max: 20, group: 'Security', label: 'Failed logins before lockout', help: 'Consecutive failed sign-ins before the account is temporarily locked.' },
    'security.lockout_minutes': { default: 15, type: 'int', min: 1, max: 1440, group: 'Security', label: 'Lockout duration (minutes)', help: 'How long a locked account stays locked. Admins can unlock sooner.' },
} satisfies Record<string, Definition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValues = { [K in SettingKey]: (typeof SETTING_DEFINITIONS)[K]['default'] extends number ? number : (typeof SETTING_DEFINITIONS)[K]['default'] extends boolean ? boolean : string };

const TTL_MS = 5_000;
let cache: { values: SettingValues; at: number } | null = null;

function cast(value: string | null, type: Definition['type']): string | number | boolean {
    switch (type) {
        case 'int':
            return Number.parseInt(value ?? '0', 10) || 0;
        case 'bool':
            return ['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase());
        default:
            return String(value ?? '');
    }
}

async function all(): Promise<SettingValues> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.values;

    let stored: Record<string, string | null> = {};
    try {
        const rows = await db().select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings);
        stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    } catch {
        stored = {};
    }

    const values = {} as Record<string, unknown>;
    for (const [key, def] of Object.entries(SETTING_DEFINITIONS) as [SettingKey, Definition][]) {
        values[key] = key in stored ? cast(stored[key], def.type) : def.default;
    }
    cache = { values: values as SettingValues, at: Date.now() };
    return cache.values;
}

export const Settings = {
    all,
    async get<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
        return (await all())[key];
    },
    async int(key: SettingKey): Promise<number> {
        return Number((await all())[key]);
    },
    async bool(key: SettingKey): Promise<boolean> {
        return Boolean((await all())[key]);
    },
    async string(key: SettingKey): Promise<string> {
        return String((await all())[key]);
    },
    async set(values: Partial<Record<SettingKey, unknown>>): Promise<void> {
        for (const [key, value] of Object.entries(values)) {
            const def = (SETTING_DEFINITIONS as Record<string, Definition>)[key];
            if (!def) continue;
            const stored = def.type === 'bool' ? (value ? '1' : '0') : String(value);
            await db()
                .insert(schema.settings)
                .values({ key, value: stored, createdAt: now(), updatedAt: now() })
                .onConflictDoUpdate({ target: schema.settings.key, set: { value: stored, updatedAt: now() } });
        }
        Settings.flush();
    },
    flush(): void {
        cache = null;
    },
    /** group => [{ key, ...definition, value }] for the settings screen. */
    async grouped(): Promise<Record<string, (Definition & { key: SettingKey; value: string | number | boolean })[]>> {
        const values = await all();
        const groups: Record<string, (Definition & { key: SettingKey; value: string | number | boolean })[]> = {};
        for (const [key, def] of Object.entries(SETTING_DEFINITIONS) as [SettingKey, Definition][]) {
            (groups[def.group] ??= []).push({ ...def, key, value: values[key] });
        }
        return groups;
    },
};

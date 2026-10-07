'use client';

import { updateSettingsAction } from '@/app/actions/admin';
import { Icon } from '../icon';
import { ActionForm, SubmitButton, useFieldError, useOld } from '../client/form';

type Setting = { key: string; type: 'string' | 'int' | 'bool'; label: string; help: string; min?: number; max?: number; value: string | number | boolean };

const GROUP_ICONS: Record<string, string> = { General: 'cog', Deadlines: 'clock', 'Project health': 'chart', 'Daily briefing': 'sparkles', Security: 'lock' };

function SettingControl({ setting }: { setting: Setting }) {
    const old = useOld(setting.key, String(setting.value));
    const current = Array.isArray(old) ? old.at(-1) : old;

    if (setting.type === 'bool') {
        const checked = ['1', 'true'].includes(String(current));
        return (
            <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input type="hidden" name={setting.key} value="0" />
                <input id={setting.key} name={setting.key} type="checkbox" value="1" className="peer sr-only" defaultChecked={checked} />
                <span className="relative h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
                <span className="text-sm text-slate-600 peer-checked:text-indigo-700">Enabled</span>
            </label>
        );
    }
    if (setting.type === 'int') {
        return (
            <div className="flex items-center gap-2 sm:justify-end">
                <input id={setting.key} name={setting.key} type="number" defaultValue={current as string} min={setting.min} max={setting.max} className="form-input w-24 text-right tabular-nums" />
                {setting.min !== undefined && setting.max !== undefined && (
                    <span className="text-xs whitespace-nowrap text-slate-400">
                        {setting.min}–{setting.max}
                    </span>
                )}
            </div>
        );
    }
    return <input id={setting.key} name={setting.key} type="text" defaultValue={current as string} className="form-input" maxLength={255} />;
}

function SettingRow({ setting }: { setting: Setting }) {
    const error = useFieldError(setting.key);
    return (
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 sm:max-w-md">
                <label htmlFor={setting.key} className="text-sm font-medium text-slate-800">
                    {setting.label}
                </label>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{setting.help}</p>
                {error && <p className="form-error">{error}</p>}
            </div>
            <div className="shrink-0 sm:w-56 sm:text-right">
                <SettingControl setting={setting} />
            </div>
        </div>
    );
}

export function SettingsForm({ groups }: { groups: Record<string, Setting[]> }) {
    return (
        <ActionForm action={updateSettingsAction} className="space-y-6">
            {Object.entries(groups).map(([group, settings]) => (
                <section key={group} className="card">
                    <div className="card-header">
                        <h2 className="card-title flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                <Icon name={GROUP_ICONS[group] ?? 'cog'} className="h-4 w-4" />
                            </span>
                            {group}
                        </h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {settings.map((s) => (
                            <SettingRow key={s.key} setting={s} />
                        ))}
                    </div>
                </section>
            ))}
            <div className="flex items-center justify-end gap-3">
                <p className="mr-auto text-xs text-slate-500">Changes apply immediately and project health is recalculated.</p>
                <SubmitButton pendingText="Saving…">
                    <Icon name="check" className="h-4 w-4" stroke={2} /> Save settings
                </SubmitButton>
            </div>
        </ActionForm>
    );
}

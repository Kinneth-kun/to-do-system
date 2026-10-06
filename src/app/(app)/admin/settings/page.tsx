import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/session';
import { Settings } from '@/lib/settings';
import { BriefingService } from '@/lib/services/briefing';
import { SettingsForm } from '@/components/admin/settings-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Settings' };

const HEALTH_RULES: [string, string, string][] = [
    ['Completed', 'emerald', 'The project is marked completed, or every task is done.'],
    ['On Hold', 'slate', 'The project status is On Hold or Cancelled.'],
    ['Delayed', 'red', 'The project is past its due date, or too many open tasks are delayed.'],
    ['At Risk', 'amber', 'Some tasks are delayed, progress is behind schedule, or the deadline is close with low progress.'],
    ['On Track', 'emerald', 'Nothing above applies.'],
];

export default async function SettingsPage() {
    await requireAdmin();
    const groups = await Settings.grouped();

    return (
        <>
            <PageHeader title="Settings" description="Tune deadlines, project health, the daily briefing and security for everyone." />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <SettingsForm groups={groups} />

                <aside className="space-y-6 lg:sticky lg:top-24">
                    <section className="card">
                        <div className="card-header">
                            <h2 className="card-title">How project health works</h2>
                        </div>
                        <div className="card-body">
                            <p className="text-xs leading-relaxed text-slate-500">Each project is checked against these rules in order — the first one that matches wins.</p>
                            <ol className="mt-4 space-y-3">
                                {HEALTH_RULES.map(([label, color, description]) => (
                                    <li key={label} className="flex gap-2.5">
                                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full bg-${color}-500`} />
                                        <div>
                                            <p className="text-sm font-medium text-slate-800">{label}</p>
                                            <p className="text-xs leading-relaxed text-slate-500">{description}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </section>
                    <section className="card">
                        <div className="card-header">
                            <h2 className="card-title">Daily briefing status</h2>
                        </div>
                        <div className="card-body text-xs leading-relaxed text-slate-500">
                            {BriefingService.configured() ? (
                                <p>An Anthropic API key is configured — briefings are written by Claude when &ldquo;Write the summary with AI&rdquo; is on.</p>
                            ) : (
                                <p>
                                    No <code className="font-mono">ANTHROPIC_API_KEY</code> is set, so briefings use the plain generated summary. Add the key to the environment to switch AI summaries on.
                                </p>
                            )}
                            <p className="mt-2">Briefings go out at 08:00 on weekdays via Vercel Cron.</p>
                        </div>
                    </section>
                </aside>
            </div>
        </>
    );
}

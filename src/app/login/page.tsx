import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { DEACTIVATED_MESSAGE } from '@/lib/auth/login';
import { formatDate, now } from '@/lib/dates';
import { readFlash } from '@/lib/flash';
import { Settings } from '@/lib/settings';
import { Icon } from '@/components/icon';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
    if (await getCurrentUser()) redirect('/');

    const params = await searchParams;
    const [appName, organization, flashes] = await Promise.all([Settings.string('general.app_name'), Settings.string('general.organization'), readFlash()]);
    const status = flashes.find((f) => f.type === 'success')?.message;
    const error = params.deactivated ? DEACTIVATED_MESSAGE : null;

    return (
        <div className="grid min-h-full lg:grid-cols-2">
            <div className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
                <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
                <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
                <div className="relative flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-white">
                        <Icon name="check" className="h-5 w-5" stroke={2.5} />
                    </span>
                    <span className="text-xl font-bold text-white">{appName}</span>
                </div>
                <div className="relative">
                    <h2 className="text-3xl leading-tight font-bold text-white">
                        Projects and tasks,
                        <br />
                        simply on track.
                    </h2>
                    <p className="mt-4 max-w-md text-slate-300">Plan work, update progress in seconds, spot delays automatically, and give leadership a clear picture — all in one place.</p>
                    <ul className="mt-8 space-y-3 text-sm text-slate-300">
                        <li className="flex items-center gap-3">
                            <Icon name="check-circle" className="h-5 w-5 text-indigo-400" /> Projects, tasks & quick one-offs
                        </li>
                        <li className="flex items-center gap-3">
                            <Icon name="clock" className="h-5 w-5 text-indigo-400" /> Automatic delay detection
                        </li>
                        <li className="flex items-center gap-3">
                            <Icon name="chart" className="h-5 w-5 text-indigo-400" /> Executive dashboard &amp; meeting mode
                        </li>
                    </ul>
                </div>
                <p className="relative text-xs text-slate-500">
                    &copy; {formatDate(now(), 'Y')} {organization}
                </p>
            </div>
            <div className="flex items-center justify-center px-4 py-12 sm:px-8">
                <div className="w-full max-w-sm">
                    <div className="mb-8 flex items-center gap-2.5 lg:hidden">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
                            <Icon name="check" className="h-5 w-5" stroke={2.5} />
                        </span>
                        <span className="text-xl font-bold text-slate-900">{appName}</span>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
                        <p className="mt-1.5 text-sm text-slate-500">Sign in to continue to your workspace.</p>
                    </div>

                    {error && (
                        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    {status && (
                        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                            <Icon name="check-circle" className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{status}</span>
                        </div>
                    )}

                    <LoginForm redirectTo={params.redirect ?? ''} />

                    <p className="mt-8 text-center text-xs text-slate-400">Need access? Ask your administrator to create an account.</p>
                </div>
            </div>
        </div>
    );
}

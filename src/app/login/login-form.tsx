'use client';

import { useEffect, useState } from 'react';
import { loginAction } from '@/app/actions/auth';
import { ActionForm, Input, SubmitButton, useFieldError } from '@/components/client/form';
import { Icon } from '@/components/icon';

function PasswordField() {
    const [show, setShow] = useState(false);
    const error = useFieldError('password');
    return (
        <div>
            <label htmlFor="password" className="form-label">
                Password
            </label>
            <div className="relative">
                <input
                    id="password"
                    name="password"
                    type={show ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`form-input pr-10 ${error ? 'border-red-400' : ''}`}
                />
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShow((s) => !s)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                    aria-label={show ? 'Hide password' : 'Show password'}
                >
                    <Icon name="eye" className="h-4 w-4" />
                </button>
            </div>
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
    // Clear a stale flash cookie (e.g. "signed out") so it does not reappear after signing in.
    useEffect(() => {
        document.cookie = 'taskflow_flash=; Max-Age=0; path=/';
    }, []);

    return (
        <ActionForm action={loginAction} className="space-y-5">
            <input type="hidden" name="redirect" value={redirectTo} />
            <Input name="login" label="Email or username" required autoFocus autoComplete="username" placeholder="you@company.com" />
            <PasswordField />
            <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="remember" value="1" className="form-checkbox" />
                Keep me signed in
            </label>
            <SubmitButton className="btn-primary w-full py-2.5" pendingText="Signing in…">
                Sign in
            </SubmitButton>
        </ActionForm>
    );
}

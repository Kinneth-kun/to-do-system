'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icon';

/*
 * Toast stack. Shows flash messages handed down by the layout, plus anything dispatched with
 * toast('Saved.') from client code. Flash messages are removed from the cookie once shown.
 */

type ToastType = 'success' | 'error' | 'warning';
type Toast = { id: string; type: ToastType; message: string };

export function toast(message: string, type: ToastType = 'success') {
    window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
}

const FLASH_COOKIE = 'taskflow_flash';

function readFlashCookie(): Toast[] {
    const raw = document.cookie.split('; ').find((c) => c.startsWith(`${FLASH_COOKIE}=`))?.slice(FLASH_COOKIE.length + 1);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(decodeURIComponent(raw));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function Toaster({ flash }: { flash: Toast[] }) {
    const [items, setItems] = useState<Toast[]>([]);
    const seen = useRef(new Set<string>());

    const push = (item: Toast) => {
        if (!item.message || seen.current.has(item.id)) return;
        seen.current.add(item.id);
        setItems((current) => [...current, item]);
        setTimeout(() => setItems((current) => current.filter((t) => t.id !== item.id)), 4500);
    };

    const pathname = usePathname();

    // Flash messages arrive from the server render, or — when a navigation re-used the layout —
    // straight from the cookie.
    useEffect(() => {
        const messages = [...flash, ...readFlashCookie()];
        if (!messages.length) return;
        messages.forEach(push);
        document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
    }, [flash, pathname]);

    useEffect(() => {
        const onToast = (event: Event) => {
            const { message, type = 'success' } = (event as CustomEvent<{ message: string; type?: ToastType }>).detail;
            push({ id: `${Date.now()}-${Math.random()}`, message, type });
        };
        window.addEventListener('toast', onToast);
        return () => window.removeEventListener('toast', onToast);
    }, []);

    const border = { success: 'border-emerald-200', error: 'border-red-200', warning: 'border-amber-200' };
    const dot = { success: 'bg-emerald-500', error: 'bg-red-500', warning: 'bg-amber-500' };

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
            {items.map((t) => (
                <div key={t.id} role="status" className={`animate-pop-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3 shadow-lg ${border[t.type]}`}>
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot[t.type]}`} />
                    <p className="flex-1 text-sm text-slate-700">{t.message}</p>
                    <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setItems((c) => c.filter((x) => x.id !== t.id))} aria-label="Dismiss">
                        <Icon name="x" className="h-4 w-4" />
                    </button>
                </div>
            ))}
        </div>
    );
}

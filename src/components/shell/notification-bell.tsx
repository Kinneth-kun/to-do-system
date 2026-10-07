'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { markAllNotificationsReadAction } from '@/app/actions/notifications';
import { Icon } from '../icon';
import { toast } from '../client/toaster';

/*
 * Live notification bell. Polls /api/notifications/recent so things that happen elsewhere — the
 * 08:00 briefing, an assignment, a deadline slipping — show up without a reload. Polling stops
 * while the tab is hidden and catches up when it becomes visible again.
 */

const POLL_MS = 45_000;

type Item = { id: number; type: string; title: string; message: string | null; icon: string; color: string; read: boolean; time: string; open_url: string };

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [unread, setUnread] = useState(initialUnread);
    const [items, setItems] = useState<Item[]>([]);
    const unreadRef = useRef(initialUnread);
    const busy = useRef(false);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        unreadRef.current = initialUnread;
        setUnread(initialUnread);
    }, [initialUnread]);

    const refresh = useCallback(async () => {
        if (busy.current) return;
        busy.current = true;
        setLoading(true);
        try {
            const response = await fetch('/api/notifications/recent', { headers: { Accept: 'application/json' }, cache: 'no-store' });
            if (!response.ok) return;
            const data: { unread_count: number; data: Item[] } = await response.json();
            const previous = unreadRef.current;
            setItems(data.data ?? []);
            setUnread(data.unread_count ?? 0);
            unreadRef.current = data.unread_count ?? 0;

            // Something arrived while the page was open — surface it once.
            if (data.unread_count > previous) {
                const newest = data.data.find((item) => !item.read);
                if (newest) toast(newest.title);
            }
        } catch {
            // Offline or the session expired — leave the badge as it is and try again later.
        } finally {
            busy.current = false;
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | null = setInterval(refresh, POLL_MS);
        const onVisibility = () => {
            if (document.hidden) {
                if (timer) clearInterval(timer);
                timer = null;
            } else {
                refresh();
                timer ??= setInterval(refresh, POLL_MS);
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            if (timer) clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [refresh]);

    useEffect(() => {
        if (open) refresh();
    }, [open, refresh]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const markAllRead = async () => {
        await markAllNotificationsReadAction();
        setUnread(0);
        unreadRef.current = 0;
        setItems((current) => current.map((item) => ({ ...item, read: true })));
    };

    return (
        <div className="relative" ref={root}>
            <button type="button" className="btn-icon relative" onClick={() => setOpen((o) => !o)} aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'} aria-haspopup="true">
                <Icon name="bell" className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 font-semibold text-white ring-2 ring-white">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="animate-fade-in absolute right-0 z-40 mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                        <p className="text-sm font-semibold text-slate-900">Notifications</p>
                        {unread > 0 && (
                            <button type="button" className="text-xs font-medium text-indigo-600 hover:underline" onClick={markAllRead}>
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {loading && !items.length && <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>}
                        {!loading && !items.length && <p className="px-4 py-8 text-center text-sm text-slate-500">You&apos;re all caught up.</p>}
                        {items.map((item) => (
                            <a
                                key={item.id}
                                href={item.open_url}
                                className={`flex gap-3 border-b border-slate-50 px-4 py-3 transition last:border-0 hover:bg-slate-50 ${item.read ? '' : 'bg-indigo-50/40'}`}
                            >
                                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-${item.color}-100 text-${item.color}-700`}>
                                    <Icon name={item.icon} className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-slate-900">{item.title}</span>
                                    {item.message && <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.message}</span>}
                                    <span className="mt-1 block text-[11px] text-slate-400">{item.time}</span>
                                </span>
                            </a>
                        ))}
                    </div>

                    <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-indigo-600 hover:bg-slate-50">
                        View all notifications
                    </Link>
                </div>
            )}
        </div>
    );
}

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icon';

type Group = { key: string; label: string; items: { id: number; title: string; subtitle: string | null; url: string }[] };

export function SearchBar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(pathname === '/search' ? (searchParams.get('q') ?? '') : '');
    const [groups, setGroups] = useState<Group[]>([]);
    const [open, setOpen] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const root = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const focus = () => input.current?.focus();
        window.addEventListener('focus-search', focus);
        return () => window.removeEventListener('focus-search', focus);
    }, []);

    useEffect(() => setOpen(false), [pathname]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const suggest = (value: string) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            if (value.trim().length < 2) {
                setGroups([]);
                setOpen(false);
                return;
            }
            try {
                const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(value)}`, { headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error();
                const data: { groups: Group[] } = await response.json();
                setGroups(data.groups ?? []);
                setOpen(true);
            } catch {
                setGroups([]);
                setOpen(false);
            }
        }, 250);
    };

    return (
        <div ref={root} className="relative w-full max-w-xl">
            <form method="GET" action="/search" className="relative" role="search">
                <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    ref={input}
                    type="search"
                    name="q"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        suggest(e.target.value);
                    }}
                    placeholder="Search projects, tasks, people…"
                    className="form-input border-slate-200 bg-slate-100/70 pl-9 shadow-none focus:bg-white"
                    aria-label="Search"
                />
            </form>
            {open && (
                <div className="absolute top-12 right-0 left-0 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    {groups.map((group) => (
                        <div key={group.key} className="border-b border-slate-100 p-2 last:border-0">
                            <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{group.label}</p>
                            {group.items.map((item) => (
                                <Link key={`${group.key}-${item.id}`} href={item.url} className="block rounded-lg px-2 py-2 hover:bg-slate-50" onClick={() => setOpen(false)}>
                                    <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                                    <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                                </Link>
                            ))}
                        </div>
                    ))}
                    {query && !groups.length && <p className="p-4 text-sm text-slate-500">No matches.</p>}
                </div>
            )}
        </div>
    );
}

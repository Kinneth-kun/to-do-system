'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Dropdown({ trigger, children, align = 'right', width = 'w-56' }: { trigger: ReactNode; children: ReactNode; align?: 'left' | 'right'; width?: string }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="relative" ref={root}>
            <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
            {/* Hidden rather than unmounted: a form inside (e.g. Sign out) must stay connected to the
                document long enough for the browser to submit it after the click closes the menu. */}
            <div
                className={`${open ? 'animate-fade-in' : 'hidden'} absolute z-40 mt-2 ${width} ${align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'} rounded-xl border border-slate-200 bg-white py-1 shadow-lg`}
                onClick={() => setOpen(false)}
            >
                {children}
            </div>
        </div>
    );
}
